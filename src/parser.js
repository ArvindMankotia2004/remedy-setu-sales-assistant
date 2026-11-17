// Rule-based understanding of a customer message.
// Works with NO API key, and is also the safety net when the AI fails or misbehaves.
// Handles English, Hinglish (Hindi in Roman script) and Hindi (Devanagari).
const { loadCatalog } = require('./catalog');

// Word boundaries that also work for Devanagari (JS \b only understands ASCII).
const B = '(?<![\\p{L}\\p{M}\\p{N}])';
const E = '(?![\\p{L}\\p{M}\\p{N}])';
const rx = (body, flags = 'gu') => new RegExp(B + '(?:' + body + ')' + E, flags);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- normalisation ----------
const DEVANAGARI_DIGITS = '०१२३४५६७८९';
const NUMBER_WORDS = {
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, panch: 5, paanch: 5, panc: 5, chhe: 6, che: 6, chah: 6,
  saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14,
  bees: 20, pachas: 50, pachaas: 50, sau: 100, hazar: 1000, hazaar: 1000, hajar: 1000,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, fifty: 50, hundred: 100,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'पंच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'बीस': 20, 'पचास': 50, 'सौ': 100, 'हजार': 1000, 'हज़ार': 1000,
};

const UNIT = {
  ratti: 'ratti|rati|ratti|rattis|रत्ती|रत्ति|रती',
  carat: 'carat|carats|karat|caret|ct|cts|कैरेट',
  piece: 'pcs|pc|piece|pieces|peace|nag|nug|nos|dana|dane|daane|bead|beads|qty|पीस|नग|दाने|दाना',
  mala: 'mala|malas|maala|माला|मालाएं',
  mukhi: 'mukhi|mukhee|mukh|मुखी',
};
const ANY_UNIT = [UNIT.ratti, UNIT.carat, UNIT.piece, UNIT.mala, UNIT.mukhi].join('|');

function normalize(text) {
  let t = String(text || '');
  t = t.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  t = t.toLowerCase().replace(/’/g, "'").replace(/'/g, '');
  t = t.replace(/(\d),(\d)/g, '$1$2'); // 1,000 -> 1000
  t = t.replace(/₹/g, ' rs ');
  t = t.replace(/[^\p{L}\p{M}\p{N}.\s]/gu, ' ');
  t = t.replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  // 2k pcs -> 2000 pcs, 5 sau -> 500
  t = t.replace(/(\d+(?:\.\d+)?)\s*k(?![\p{L}])/gu, (_, n) => String(Math.round(parseFloat(n) * 1000)));
  t = t.replace(new RegExp('(\\d+)\\s*' + rx('sau|सौ', '').source, 'gu'), (_, n) => String(+n * 100));
  t = t.replace(new RegExp('(\\d+)\\s*' + rx('hazar|hazaar|hajar|hajaar|हजार|हज़ार', '').source, 'gu'), (_, n) => String(+n * 1000));
  // number words directly followed by a unit: "paanch ratti" -> "5 ratti", "panchmukhi" -> "5 mukhi"
  const words = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  t = t.replace(new RegExp(B + '(' + words + ')\\s*-?\\s*(?=(?:' + ANY_UNIT + ')' + E + ')', 'gu'), (_, w) => NUMBER_WORDS[w] + ' ');
  // astrology weights: sava 5 = 5.25, sade 5 = 5.5, paune 6 = 5.75
  t = t.replace(new RegExp(rx('sava|sawa|savva|सवा', '').source + '\\s+(\\d+)', 'gu'), (_, n) => String(+n + 0.25));
  t = t.replace(new RegExp(rx('sade|sadhe|saade|साढ़े|साढे', '').source + '\\s+(\\d+)', 'gu'), (_, n) => String(+n + 0.5));
  t = t.replace(new RegExp(rx('paune|pone|पौने', '').source + '\\s+(\\d+)', 'gu'), (_, n) => String(+n - 0.25));
  return t.replace(/\s+/g, ' ').trim();
}

// ---------- language ----------
const HINGLISH = new Set(('kya hai hain ka ki ke chahiye chaiye chahie chahiyе kitna kitne kitni mujhe muje hume humein hamein bhai bhaiya ji aur ' +
  'nahi nhi nai kab kaise kaisa kahan kaha mera meri mere aap aapka aapke bhejo bhej dena dijiye dijie karna karwana karwani wala wali ' +
  'milega milegi abhi tak bhi se ko hoga hogi lagega batao bataiye bata thoda jaldi accha acha theek thik sahi chahte chahta chahti ' +
  'liye lena lene sakta sakte rakhna rakhte koi kuch sab saath bahut bhut').split(' '));

function detectLanguage(original) {
  const letters = (original.match(/\p{L}/gu) || []).length || 1;
  const deva = (original.match(/[ऀ-ॿ]/g) || []).length;
  if (deva / letters > 0.3) return 'hi';
  const tokens = original.toLowerCase().match(/[a-z]+/g) || [];
  const hits = tokens.filter((w) => HINGLISH.has(w)).length;
  if (hits >= 2 || (hits === 1 && tokens.length <= 10)) return 'hinglish';
  return 'en';
}

// ---------- intent ----------
const INTENT_KEYWORDS = {
  complaint: 'kharab|kharaab|toot|toota|tuta|tuti|tooti|broken|break|damage|damaged|defective|fake|nakli|naqli|duplicate|galat|wrong|refund|return|wapas|vapas|complaint|complain|shikayat|cheated|cheat|dhokha|nahi mila|nahi aaya|nhi aaya|nahi aya|nhi mila|not received|not delivered|delay|delayed|bekar|bekaar|worst|crack|cracked|problem|issue|खराब|टूटा|टूटी|नकली|गलत|शिकायत|वापस|रिफंड|नहीं मिला|नहीं आया',
  order_status: 'order status|status|tracking|track|awb|dispatch|dispatched|shipped|courier|kab aayega|kab ayega|kab aaega|kab milega|kab tak|kahan hai|kaha hai|kahan pahuncha|delivery kab|order id|where is my order|ऑर्डर कहाँ|कब आएगा|कब मिलेगा|ट्रैकिंग',
  white_label: 'custom packaging|custom box|white label|whitelabel|white labelling|white labeling|branding|apna logo|hamara logo|our logo|my logo|private label|own brand|apne brand|custom print|लोगो|ब्रांडिंग',
  bulk_order: 'bulk|wholesale|wholesaler|dealer|dealership|distributor|reseller|b2b|thok|thoke|carton|monthly|regular supply|every month|har mahine|stockist|थोक|होलसेल',
  puja_booking: 'book|booking|karwana|karwani|karwaana|karana|karani|muhurat|mahurat|slot|date|करवाना|करवानी|बुक|मुहूर्त',
  order_request: 'chahiye|chaiye|chahie|chahiyе|chahte|want|need|required|order karna|order dena|order karni|bhejo|bhej do|bhejdo|send me|buy|kharidna|lena hai|lene hai|चाहिए|भेजो|भेज दो|खरीदना|लेना',
  price_enquiry: 'rate|rates|price|prices|pricing|cost|kitna|kitne|kitni|kimat|keemat|kimmat|bhav|bhaav|daam|dam|charges|charge|quote|quotation|how much|price list|rate list|lagega|कीमत|दाम|रेट|भाव|कितने|कितना|कितनी|प्राइस',
  availability: 'available|availability|stock|in stock|milega|milegi|mil jayega|mil jaega|hai kya|uplabdh|उपलब्ध|मिलेगा|मिलेगी',
  authenticity: 'certificate|certified|lab|original|asli|real|genuine|natural|test|tested|सर्टिफिकेट|असली|ओरिजिनल',
  greeting: 'hi|hello|hey|namaste|namaskar|pranam|ram ram|jai shree ram|jai shri ram|radhe radhe|good morning|नमस्ते|नमस्कार|प्रणाम|राम राम',
};
const INTENT_RES = Object.fromEntries(Object.entries(INTENT_KEYWORDS).map(([k, v]) => [k, rx(v.split('|').map((w) => escapeRe(w).replace(/ /g, '\\s+')).join('|'))]));

const DELIVERY_ISSUE = rx('nahi mila|nahi aaya|nhi aaya|nahi aya|nhi mila|not received|not delivered|not yet received|delay|delayed|late|abhi tak|नहीं मिला|नहीं आया|देरी');
const PRODUCT_ISSUE = rx('kharab|kharaab|toot|toota|tuta|tuti|tooti|broken|damage|damaged|defective|fake|nakli|naqli|duplicate|galat|wrong|crack|cracked|खराब|टूटा|टूटी|नकली|गलत');

const INTENT_PRIORITY = ['complaint', 'order_status', 'white_label', 'bulk_order', 'puja_booking', 'order_request', 'price_enquiry', 'availability', 'authenticity', 'greeting'];

const INTENT_LABELS = {
  complaint: 'Complaint', order_status: 'Order status', white_label: 'White-label / custom packaging', bulk_order: 'Bulk order',
  puja_booking: 'Puja booking', order_request: 'Order request', price_enquiry: 'Price enquiry', availability: 'Availability check',
  authenticity: 'Authenticity / certificate', greeting: 'Greeting', general: 'General query',
};

// ---------- products ----------
let aliasIndex = null;
function buildAliasIndex() {
  if (aliasIndex) return aliasIndex;
  const { products, meta } = loadCatalog();
  const exact = [];
  const fuzzy = [];
  for (const p of products) {
    for (const a of p.aliases) {
      const n = normalize(a);
      exact.push({ productId: p.id, alias: n, re: rx(escapeRe(n).replace(/ /g, '\\s+')) });
      if (/^[a-z]+$/.test(n) && n.length >= 5) fuzzy.push({ productId: p.id, alias: n });
    }
  }
  const notCarried = meta.notCarried.map((a) => ({ term: a, re: rx(escapeRe(normalize(a)).replace(/ /g, '\\s+')) }));
  aliasIndex = { exact, fuzzy, notCarried };
  return aliasIndex;
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const RUDRAKSHA_WORD = rx('rudraksha|rudraksh|rudrakhs|rudrakash|rudraksa|rudrakha|rudraks|rudrax|rudracha|रुद्राक्ष|रूद्राक्ष|रुद्राक्श|रुद्राक्षा');
const MUKHI_RE = new RegExp('(\\d+)\\s*-?\\s*(?:' + UNIT.mukhi + ')' + E, 'gu');
const MALA_RE = rx(UNIT.mala);

function overlaps(a, b) { return a.start < b.end && b.start < a.end; }

function findMentions(text) {
  const { exact, fuzzy, notCarried } = buildAliasIndex();
  const found = [];

  for (const a of exact) for (const m of text.matchAll(a.re)) found.push({ type: 'product', productId: a.productId, start: m.index, end: m.index + m[0].length, matched: m[0] });

  // typo tolerance: "pukhraaj", "neelum", "lehsunia"
  for (const m of text.matchAll(/[a-z]{5,}/g)) {
    for (const f of fuzzy) {
      const d = levenshtein(m[0], f.alias);
      if (d > 0 && d <= (f.alias.length >= 8 ? 2 : 1)) found.push({ type: 'product', productId: f.productId, start: m.index, end: m.index + m[0].length, matched: m[0], fuzzy: true });
    }
  }

  for (const n of notCarried) for (const m of text.matchAll(n.re)) found.push({ type: 'not_carried', term: m[0], start: m.index, end: m.index + m[0].length });

  // Rudraksha words and "N mukhi" expressions; merged into one cluster when next to each other
  const rud = [];
  for (const m of text.matchAll(RUDRAKSHA_WORD)) rud.push({ start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(MUKHI_RE)) rud.push({ start: m.index, end: m.index + m[0].length, mukhi: +m[1] });
  rud.sort((a, b) => a.start - b.start);
  const clusters = [];
  for (const r of rud) {
    const last = clusters[clusters.length - 1];
    if (last && r.start - last.end <= 2) { last.end = Math.max(last.end, r.end); if (r.mukhi) last.mukhi = r.mukhi; }
    else clusters.push({ ...r });
  }
  for (const c of clusters) {
    // "gauri shankar rudraksha" is one product, not two
    const explicitNeighbour = found.find((f) => f.type === 'product' && f.productId.startsWith('RUD-') && (overlaps(f, c) || Math.abs(c.start - f.end) <= 2 || Math.abs(f.start - c.end) <= 2));
    if (explicitNeighbour) { explicitNeighbour.end = Math.max(explicitNeighbour.end, c.end); explicitNeighbour.start = Math.min(explicitNeighbour.start, c.start); continue; }
    found.push({ type: 'rudraksha', start: c.start, end: c.end, mukhi: c.mukhi || null, matched: text.slice(c.start, c.end) });
  }

  // longest match wins on overlaps, exact beats fuzzy
  found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || (a.fuzzy ? 1 : 0) - (b.fuzzy ? 1 : 0));
  const kept = [];
  for (const f of found) if (!kept.some((k) => overlaps(k, f))) kept.push(f);
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

function resolveRudraksha(mention, text, nextStart) {
  const { products } = loadCatalog();
  const after = text.slice(mention.end, Math.min(nextStart, mention.end + 14));
  const isMala = MALA_RE.test(text.slice(mention.start, mention.end) + ' ' + after);
  MALA_RE.lastIndex = 0;
  const form = isMala ? 'mala' : 'bead';
  const assumptions = [];
  let mukhi = mention.mukhi;
  if (!mukhi) { mukhi = 5; assumptions.push('mukhi_assumed_5'); }
  const product = products.find((p) => p.rudraksha && p.rudraksha.mukhi === mukhi && p.rudraksha.form === form);
  if (!product) return { notCarried: `${mukhi} Mukhi Rudraksha${isMala ? ' Mala' : ''}` };
  return { productId: product.id, assumptions };
}

// ---------- quantities ----------
const CONJ = rx('aur|and|tatha|also|plus|saath me|sath me|और|तथा|एवं');
const WEIGHT_RE = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(' + UNIT.ratti + '|' + UNIT.carat + ')' + E, 'u');
const PIECE_RE = new RegExp('(\\d+)\\s*(?:' + UNIT.piece + '|' + UNIT.mala + ')' + E, 'u');
const CARAT_ONLY = new RegExp('^(?:' + UNIT.carat + ')$', 'u');

function extractQty(segment) {
  let s = ' ' + segment + ' ';
  s = s.replace(MUKHI_RE, ' ');
  s = s.replace(/(?:\+?91)?\d{10,}/g, ' '); // phone numbers
  s = s.replace(new RegExp(rx('rs|inr|budget|rupees|rupaye|rupay|रुपये').source + '\\s*\\d+(?:\\.\\d+)?', 'gu'), ' ');
  s = s.replace(/\d+(?:\.\d+)?\s*(?:rs|rupees|rupaye|\/-)/g, ' ');
  const out = {};
  const w = s.match(WEIGHT_RE);
  if (w) {
    const val = parseFloat(w[1]);
    out.weight = CARAT_ONLY.test(w[2]) ? Math.round((val / 0.91) * 100) / 100 : val; // 1 ratti = 0.91 carat
    if (CARAT_ONLY.test(w[2])) out.fromCarat = val;
    s = s.replace(w[0], ' ');
  }
  const p = s.match(PIECE_RE);
  if (p) { out.pieces = parseInt(p[1], 10); s = s.replace(p[0], ' '); }
  const bare = s.match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/);
  if (bare) out.bare = parseFloat(bare[0]);
  return out;
}

function splitAtConjunction(segment) {
  let last = null;
  for (const m of segment.matchAll(CONJ)) last = m;
  if (!last) return [segment, ''];
  return [segment.slice(0, last.index), segment.slice(last.index)];
}

function buildItems(text, mentions) {
  const { byId } = loadCatalog();
  const items = [];
  const notCarried = [];
  const productMentions = mentions.filter((m) => m.type !== 'not_carried');
  mentions.filter((m) => m.type === 'not_carried').forEach((m) => notCarried.push(m.term));

  // text between two product mentions is split at the last "aur/and/," so each gets its own numbers
  const segs = productMentions.map(() => ({ before: '', after: '' }));
  productMentions.forEach((m, i) => {
    const next = productMentions[i + 1];
    const between = text.slice(m.end, next ? next.start : text.length);
    if (!next) { segs[i].after = between; return; }
    const [left, right] = splitAtConjunction(between);
    segs[i].after = left;
    segs[i + 1].before = right;
  });
  if (productMentions.length) segs[0].before = text.slice(0, productMentions[0].start);

  productMentions.forEach((m, i) => {
    let productId = m.productId;
    let assumptions = [];
    if (m.type === 'rudraksha') {
      const next = productMentions[i + 1];
      const r = resolveRudraksha(m, text, next ? next.start : text.length);
      if (r.notCarried) { notCarried.push(r.notCarried); return; }
      productId = r.productId;
      assumptions = r.assumptions;
    }
    if (m.fuzzy) assumptions.push(`spelling_matched:${m.matched}`);
    const product = byId.get(productId);
    const a = extractQty(segs[i].after);
    const b = extractQty(segs[i].before);
    const q = { weight: a.weight ?? b.weight, pieces: a.pieces ?? b.pieces, bare: a.bare ?? b.bare, fromCarat: a.fromCarat ?? b.fromCarat };

    const item = { productId, assumptions, matchedText: m.matched };
    if (product.unit === 'ratti') {
      if (q.weight) item.weight = q.weight;
      if (q.pieces) item.pieces = q.pieces;
      if (!q.weight && q.bare) {
        if (q.bare <= 25) { item.weight = q.bare; item.assumptions.push('number_read_as_ratti'); }
        else if (!q.pieces) item.pieces = Math.round(q.bare);
      }
      if (q.fromCarat) item.assumptions.push(`converted_from_carat:${q.fromCarat}`);
    } else {
      const pcs = q.pieces ?? (q.bare ? Math.round(q.bare) : null);
      if (pcs) item.pieces = pcs;
    }

    // same product twice: keep the one that has quantities
    const dup = items.find((x) => x.productId === productId);
    if (dup) { if (!dup.weight && !dup.pieces) Object.assign(dup, item); return; }
    items.push(item);
  });
  return { items, notCarried: [...new Set(notCarried)] };
}

// ---------- customer details ----------
const CITIES = ['delhi', 'new delhi', 'mumbai', 'bombay', 'kolkata', 'calcutta', 'chennai', 'bangalore', 'bengaluru', 'hyderabad', 'pune', 'ahmedabad', 'surat', 'jaipur', 'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal', 'patna', 'varanasi', 'banaras', 'kashi', 'agra', 'noida', 'gurgaon', 'gurugram', 'faridabad', 'ghaziabad', 'meerut', 'chandigarh', 'ludhiana', 'amritsar', 'dehradun', 'haridwar', 'rishikesh', 'ujjain', 'nashik', 'vadodara', 'rajkot', 'udaipur', 'jodhpur', 'ajmer', 'kota', 'raipur', 'ranchi', 'bhubaneswar', 'guwahati', 'kochi', 'coimbatore', 'madurai', 'visakhapatnam', 'vijayawada', 'mathura', 'vrindavan', 'prayagraj', 'allahabad', 'gorakhpur', 'gwalior', 'jabalpur', 'aurangabad', 'thane', 'jammu', 'shimla', 'दिल्ली', 'मुंबई', 'जयपुर', 'लखनऊ', 'वाराणसी', 'पटना', 'इंदौर', 'भोपाल', 'उज्जैन', 'हरिद्वार', 'कोलकाता', 'पुणे', 'अहमदाबाद'];
const CITY_RE = rx(CITIES.map(escapeRe).join('|'));

function extractCustomer(original, normalized) {
  const out = {};
  const phone = original.replace(/[\s-]/g, '').match(/(?:\+?91)?([6-9]\d{9})(?!\d)/);
  if (phone) out.phone = phone[1];
  const name = original.match(/(?:mera naam|my name is|name is|naam hai|this is|i am|main hoon|i'm)\s+([A-Za-z]{2,}(?:\s+[A-Z][a-z]+)?)/i);
  const STOP = new Set(['looking', 'interested', 'from', 'a', 'an', 'the', 'need', 'want', 'astrologer', 'retailer', 'dealer']);
  if (name && !STOP.has(name[1].toLowerCase())) out.name = name[1].replace(/\b\w/g, (c) => c.toUpperCase());
  const city = normalized.match(CITY_RE);
  if (city) out.city = city[0].replace(/\b\w/g, (c) => c.toUpperCase());
  return out;
}

// ---------- main ----------
function parseMessage(message) {
  const text = normalize(message);
  const language = detectLanguage(message);
  const mentions = findMentions(text);
  const { items, notCarried } = buildItems(text, mentions);

  const hits = {};
  for (const [intent, re] of Object.entries(INTENT_RES)) {
    const m = text.match(re);
    if (m) hits[intent] = m.length;
  }

  const { byId } = loadCatalog();
  const isBulkQty = items.some((it) => {
    const p = byId.get(it.productId);
    if (p.category === 'puja' || p.tiers.length < 2) return false;
    if (p.unit === 'ratti') return (it.pieces || 0) >= 5 || (it.pieces || 1) * (it.weight || 0) >= p.tiers[2]?.min;
    return (it.pieces || 0) >= p.tiers[1].min;
  });
  if (isBulkQty) hits.bulk_order = (hits.bulk_order || 0) + 1;
  const hasPuja = items.some((it) => byId.get(it.productId).category === 'puja');
  const mentionsPuja = /puja|pooja|puja|anushthan|anusthan|jaap|पूजा|अनुष्ठान|जाप/.test(text);
  if (hits.puja_booking && !hasPuja && !mentionsPuja) delete hits.puja_booking; // "date"/"book" only matter for pujas
  if (mentionsPuja && !hasPuja && !items.length) hits.puja_booking = (hits.puja_booking || 0) + 1;
  if (hits.authenticity && hits.complaint && /fake|nakli|naqli|duplicate|नकली/.test(text)) delete hits.authenticity;
  // "status"/"track" without the word order are weak; keep only with order words
  if (hits.order_status && !/order|parcel|courier|delivery|awb|track|ऑर्डर|डिलीवरी/.test(text)) delete hits.order_status;
  if (!Object.keys(hits).some((k) => k !== 'greeting') && items.length) hits.price_enquiry = 1; // "Neelam 5 ratti" = asking price

  const detected = INTENT_PRIORITY.filter((k) => hits[k]);
  const intent = detected[0] || 'general';
  const secondary = detected.slice(1).filter((k) => k !== 'greeting');

  let confidence = intent === 'general' ? 0.3 : 0.6 + Math.min(0.2, 0.1 * (hits[intent] || 1));
  if (items.length && intent !== 'general') confidence += 0.15;
  if (notCarried.length) confidence += 0.05;

  return {
    normalized: text,
    language,
    intent,
    intentLabel: INTENT_LABELS[intent],
    secondaryIntents: secondary,
    confidence: Math.min(0.97, Math.round(confidence * 100) / 100),
    items,
    notCarried,
    pujaGeneric: mentionsPuja && !hasPuja,
    complaintType: hits.complaint ? (DELIVERY_ISSUE.test(text) && !PRODUCT_ISSUE.test(text) ? 'delivery' : 'product') : null,
    customer: extractCustomer(message, text),
  };
}

module.exports = { parseMessage, normalize, detectLanguage, INTENT_LABELS, INTENT_PRIORITY };
