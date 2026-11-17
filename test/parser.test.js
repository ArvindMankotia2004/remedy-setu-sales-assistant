const test = require('node:test');
const assert = require('node:assert');
const { parseMessage } = require('../src/parser');
const { priceLine } = require('../src/catalog');

const ids = (r) => r.items.map((i) => i.productId);

test('Hinglish price enquiry with weight', () => {
  const r = parseMessage('Neelam ka rate kya hai 5 ratti?');
  assert.equal(r.language, 'hinglish');
  assert.equal(r.intent, 'price_enquiry');
  assert.deepEqual(ids(r), ['GEM-NEELAM']);
  assert.equal(r.items[0].weight, 5);
});

test('Bulk rudraksha without mukhi assumes 5 mukhi and flags it', () => {
  const r = parseMessage('Rudraksha 100 pcs chahiye');
  assert.equal(r.intent, 'bulk_order');
  assert.deepEqual(ids(r), ['RUD-5M-BEAD']);
  assert.equal(r.items[0].pieces, 100);
  assert.ok(r.items[0].assumptions.includes('mukhi_assumed_5'));
});

test('Mukhi number is not mistaken for quantity', () => {
  const r = parseMessage('7 mukhi rudraksha 20 pcs');
  assert.deepEqual(ids(r), ['RUD-7M-BEAD']);
  assert.equal(r.items[0].pieces, 20);
});

test('Multiple products each get their own quantity', () => {
  const r = parseMessage('5 mukhi rudraksha 500 pcs aur sphatik mala 20 ka wholesale rate');
  assert.deepEqual(ids(r), ['RUD-5M-BEAD', 'MALA-SPHATIK']);
  assert.equal(r.items[0].pieces, 500);
  assert.equal(r.items[1].pieces, 20);
  assert.equal(r.intent, 'bulk_order');
});

test('Hindi (Devanagari) with carat conversion', () => {
  const r = parseMessage('नीलम 4 कैरेट की कीमत क्या है?');
  assert.equal(r.language, 'hi');
  assert.equal(r.intent, 'price_enquiry');
  assert.equal(r.items[0].weight, 4.4); // 4 / 0.91
});

test('Sava paanch ratti = 5.25 and typo tolerance', () => {
  const r = parseMessage('pukhraaj sava paanch ratti chahiye');
  assert.deepEqual(ids(r), ['GEM-PUKHRAJ']);
  assert.equal(r.items[0].weight, 5.25);
});

test('Products we do not sell are reported, not substituted', () => {
  const r = parseMessage('heera ka rate? aur 3 mukhi rudraksha');
  assert.deepEqual(ids(r), []);
  assert.ok(r.notCarried.includes('heera'));
  assert.ok(r.notCarried.includes('3 Mukhi Rudraksha'));
});

test('Complaint wins over other intents and detects delivery issue', () => {
  const r = parseMessage('Mera order abhi tak nahi aaya, 10 din ho gaye');
  assert.equal(r.intent, 'complaint');
  assert.equal(r.complaintType, 'delivery');
});

test('White label request', () => {
  const r = parseMessage('We need 50 rudraksha malas with our logo on the box');
  assert.equal(r.intent, 'white_label');
  assert.deepEqual(ids(r), ['RUD-5M-MALA']);
  assert.equal(r.items[0].pieces, 50);
});

test('Puja booking', () => {
  const r = parseMessage('Rudrabhishek puja karwana hai next monday, kitna lagega');
  assert.equal(r.intent, 'puja_booking');
  assert.deepEqual(ids(r), ['PUJA-RUDRABHISHEK']);
});

test('Phone and city extraction', () => {
  const r = parseMessage('Jaipur se hu, neelam chahiye. Call 98765 43210');
  assert.equal(r.customer.phone, '9876543210');
  assert.equal(r.customer.city, 'Jaipur');
});

test('Tier pricing uses total ratti for gemstones', () => {
  const line = priceLine({ productId: 'GEM-NEELAM', pieces: 10, weight: 5, assumptions: [] });
  assert.equal(line.billableQty, 50);
  assert.equal(line.unitPrice, 5200);
  assert.equal(line.total, 260000);
  assert.deepEqual(line.nextTier, { min: 100, price: 4800 });
});

test('Tier pricing for pieces and unknown product returns null', () => {
  assert.equal(priceLine({ productId: 'RUD-5M-BEAD', pieces: 500, assumptions: [] }).unitPrice, 70);
  assert.equal(priceLine({ productId: 'RUD-5M-BEAD', pieces: 9, assumptions: [] }).unitPrice, 150);
  assert.equal(priceLine({ productId: 'GEM-HEERA', pieces: 1, assumptions: [] }), null);
});
