// Guardrails: code-level checks that stop the AI from inventing products, prices or promises.
// The AI is only trusted for language understanding and tone; facts always come from the price list.
const { loadCatalog } = require('./catalog');
const { normalize, INTENT_PRIORITY } = require('./parser');

const VALID_INTENTS = new Set([...INTENT_PRIORITY, 'general']);

const numbersIn = (text) => {
  const t = String(text).replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d)).replace(/(\d),(?=\d)/g, '$1');
  return (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
};

/**
 * Check the AI's structured reading of a message.
 * Drops any product id that is not in the catalogue and any quantity that does not
 * appear in the customer's message. Returns { value, log }.
 */
function validateExtraction(raw, message) {
  const { byId } = loadCatalog();
  const log = [];
  const value = { intent: null, secondaryIntents: [], items: [], notCarried: [], customer: {} };
  if (!raw || typeof raw !== 'object') { log.push({ level: 'blocked', message: 'AI output was not an object' }); return { value, log }; }

  if (VALID_INTENTS.has(raw.intent)) value.intent = raw.intent;
  else log.push({ level: 'blocked', message: `AI returned unknown intent "${raw.intent}" — ignored` });
  if (Array.isArray(raw.secondary_intents)) value.secondaryIntents = raw.secondary_intents.filter((i) => VALID_INTENTS.has(i) && i !== value.intent);

  const msgNumbers = numbersIn(normalize(message));
  const isFromMessage = (n, { carat = false } = {}) => msgNumbers.some((m) => Math.abs(m - n) < 0.01 || (carat && Math.abs(m / 0.91 - n) < 0.06));

  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const product = byId.get(it && it.product_id);
    if (!product) { log.push({ level: 'blocked', message: `AI suggested a product that is not in the price list ("${it && (it.product_id || it.name)}") — removed` }); continue; }
    const item = { productId: product.id, assumptions: ['from_ai'] };
    const pieces = Number(it.pieces);
    const weight = Number(it.weight_ratti);
    if (pieces > 0) {
      if (Number.isInteger(pieces) && pieces <= 100000 && isFromMessage(pieces)) item.pieces = pieces;
      else log.push({ level: 'blocked', message: `AI quantity ${pieces} for ${product.id} not found in message — ignored` });
    }
    if (weight > 0 && product.unit === 'ratti') {
      if (weight <= 100 && isFromMessage(weight, { carat: true })) item.weight = Math.round(weight * 100) / 100;
      else log.push({ level: 'blocked', message: `AI weight ${weight} ratti for ${product.id} not found in message — ignored` });
    }
    value.items.push(item);
  }

  if (Array.isArray(raw.not_carried)) value.notCarried = raw.not_carried.filter((x) => typeof x === 'string' && x.length <= 40).slice(0, 5);
  if (raw.customer && typeof raw.customer === 'object') {
    for (const k of ['name', 'city']) if (typeof raw.customer[k] === 'string' && raw.customer[k].length <= 40) value.customer[k] = raw.customer[k];
  }
  return { value, log };
}

const PROMISE_WORDS = ['discount', 'offer', 'guarantee', 'guaranteed', 'cashback', 'coupon', 'gift', 'free sample', 'emi', 'cod', 'cash on delivery', 'छूट', 'डिस्काउंट', 'ऑफर', 'गारंटी'];

/**
 * Check an AI-written reply against the verified draft.
 * Every number must already exist in the draft or the customer's message,
 * no other catalogue product may be named, and no new promises may be added.
 */
function validateReply(reply, { draft, message, lines }) {
  const problems = [];
  if (typeof reply !== 'string' || reply.trim().length < 10) problems.push('Reply is empty');
  if (reply && reply.length > 2000) problems.push('Reply is too long');

  const allowed = new Set([...numbersIn(draft), ...numbersIn(message)].map(String));
  const extra = [...new Set(numbersIn(reply || '').map(String))].filter((n) => !allowed.has(n));
  if (extra.length) problems.push(`Reply contains numbers not in the verified quote: ${extra.join(', ')}`);

  const replyN = normalize(reply || '');
  const sourceN = normalize(draft + ' ' + message);
  const quoted = new Set(lines.map((l) => l.productId));
  const { products } = loadCatalog();
  for (const p of products) {
    if (quoted.has(p.id)) continue;
    for (const a of p.aliases) {
      const n = normalize(a);
      if (n.length < 4) continue;
      const re = new RegExp('(?<![\\p{L}\\p{M}])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{M}])', 'u');
      if (re.test(replyN) && !re.test(sourceN)) { problems.push(`Reply mentions a product that was not quoted: ${p.id}`); break; }
    }
  }

  for (const w of PROMISE_WORDS) {
    const re = new RegExp('(?<![\\p{L}])' + w + '(?![\\p{L}])', 'iu');
    if (re.test(reply || '') && !re.test(draft)) problems.push(`Reply adds a promise not in the draft: "${w}"`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { validateExtraction, validateReply, numbersIn };
