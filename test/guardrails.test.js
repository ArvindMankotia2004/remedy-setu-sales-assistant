// Tests that the AI cannot sneak in invented products, prices or promises.
// Includes an end-to-end test against a fake (mock) AI server that deliberately misbehaves.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { validateExtraction, validateReply } = require('../src/guardrails');
const { priceLine } = require('../src/catalog');

const draft = `Aapke liye rate:\n• Neelam (Blue Sapphire) – Ceylon — 5 ratti\n   ₹6,500/ratti × 5 = ₹32,500\n   10+ ratti: ₹5,800/ratti`;
const lines = [priceLine({ productId: 'GEM-NEELAM', weight: 5, assumptions: [] })];
const message = 'Neelam ka rate kya hai 5 ratti?';

test('reply with the same facts passes', () => {
  const ok = validateReply('Namaste ji! Neelam 5 ratti ka rate ₹6,500/ratti hai, total ₹32,500. 10+ ratti par ₹5,800/ratti.', { draft, message, lines });
  assert.equal(ok.ok, true, ok.problems.join());
});

test('reply with a changed price is rejected', () => {
  const r = validateReply('Neelam 5 ratti ₹6,000/ratti, total ₹30,000', { draft, message, lines });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /numbers not in the verified quote/);
});

test('reply that adds another product is rejected', () => {
  const r = validateReply('Neelam ₹6,500/ratti × 5 = ₹32,500. Aap Pukhraj bhi le sakte hain.', { draft, message, lines });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('GEM-PUKHRAJ')));
});

test('reply that invents a discount is rejected', () => {
  const r = validateReply('Neelam ₹6,500/ratti × 5 = ₹32,500. Special discount bhi milega!', { draft, message, lines });
  assert.equal(r.ok, false);
});

test('extraction drops invented product ids and invented quantities', () => {
  const { value, log } = validateExtraction({
    intent: 'price_enquiry',
    items: [{ product_id: 'GEM-HEERA', pieces: 1 }, { product_id: 'GEM-NEELAM', weight_ratti: 7, pieces: null }],
  }, message);
  assert.deepEqual(value.items.map((i) => i.productId), ['GEM-NEELAM']);
  assert.equal(value.items[0].weight, undefined); // 7 is not in the message
  assert.equal(log.filter((l) => l.level === 'blocked').length, 2);
});

test('extraction rejects unknown intents', () => {
  const { value } = validateExtraction({ intent: 'give_free_stuff', items: [] }, message);
  assert.equal(value.intent, null);
});

test('end to end with a misbehaving mock AI: invented product and wrong price are blocked', async () => {
  let call = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      call++;
      const content = call === 1
        ? JSON.stringify({ intent: 'price_enquiry', items: [{ product_id: 'GEM-NEELAM', weight_ratti: 5 }, { product_id: 'GEM-BLUE-DIAMOND', pieces: 1 }, { product_id: 'GEM-PANNA', pieces: 1 }], not_carried: [] })
        : 'Namaste ji, Neelam 5 ratti sirf ₹5,000/ratti mein! Total ₹25,000.';
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test';
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    const { analyzeMessage } = require('../src/analyze');
    const r = await analyzeMessage(message);
    assert.deepEqual(r.lines.map((l) => l.productId), ['GEM-NEELAM']); // invented + unmentioned products removed
    assert.equal(r.lines[0].total, 32500); // price from catalogue
    assert.equal(r.engine.reply, 'template'); // AI reply with wrong price rejected
    assert.ok(r.reply.includes('₹32,500'));
    assert.ok(r.guardrails.some((g) => g.level === 'blocked' && g.message.includes('GEM-BLUE-DIAMOND')));
    assert.ok(r.guardrails.some((g) => g.level === 'blocked' && g.message.includes('GEM-PANNA')));
    assert.ok(r.guardrails.some((g) => g.level === 'blocked' && g.message.includes('AI reply rejected')));
  } finally {
    delete process.env.AI_PROVIDER; delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_BASE_URL;
    server.close();
  }
});

test('end to end with a well-behaved mock AI: polished reply is used', async () => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const isJson = JSON.parse(body).response_format;
      const content = isJson
        ? JSON.stringify({ intent: 'price_enquiry', items: [{ product_id: 'GEM-NEELAM', weight_ratti: 5 }] })
        : 'Namaste ji 🙏 Neelam (Blue Sapphire) – Ceylon, 5 ratti: ₹6,500/ratti × 5 = ₹32,500. 10+ ratti lene par ₹5,800/ratti. GST extra as applicable. Quantity aur city confirm kar dijiye!';
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test';
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    const { analyzeMessage } = require('../src/analyze');
    const r = await analyzeMessage(message);
    assert.equal(r.engine.understanding, 'ai');
    assert.equal(r.engine.reply, 'ai');
    assert.ok(r.reply.includes('₹32,500'));
  } finally {
    delete process.env.AI_PROVIDER; delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_BASE_URL;
    server.close();
  }
});
