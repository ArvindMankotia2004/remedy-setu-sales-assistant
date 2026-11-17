// The two AI steps and their prompts.
//  1. understand(): read a messy WhatsApp message -> intent + product IDs + quantities (JSON)
//  2. polishReply(): rewrite the verified template reply so it sounds natural
// Neither step is allowed to decide a price. Outputs are checked in guardrails.js.
const { complete, parseJSONLoose } = require('./llm');
const { loadCatalog } = require('./catalog');
const { INTENT_PRIORITY } = require('./parser');

function catalogueForPrompt() {
  return loadCatalog().products
    .map((p) => `${p.id} | ${p.name.en} | unit: ${p.unit} | also called: ${p.aliases.join(', ') || '-'}`)
    .join('\n');
}

const UNDERSTAND_SYSTEM = () => `You read WhatsApp messages sent to Remedy Setu, an Indian B2B supplier of gemstones, rudraksha, spiritual products and puja services.
Messages may be in English, Hinglish (Hindi in Roman script) or Hindi (Devanagari), with typos.

PRODUCT CATALOGUE (the ONLY products that exist):
${catalogueForPrompt()}

Return ONLY a JSON object with this shape:
{
  "intent": one of ${JSON.stringify([...INTENT_PRIORITY, 'general'])},
  "secondary_intents": [other intents from the same list that also apply],
  "items": [{ "product_id": "<exact ID from the catalogue>", "pieces": <number or null>, "weight_ratti": <number or null> }],
  "not_carried": ["<products the customer asked for that are NOT in the catalogue>"],
  "customer": { "name": <string or null>, "city": <string or null> }
}

Rules:
- product_id MUST be copied exactly from the catalogue. If the customer asks for something not in the catalogue, put it in "not_carried" and do NOT map it to a different product.
- Rudraksha without a mukhi number means the 5 Mukhi product. A mukhi or form we do not list (e.g. 3 mukhi, 7 mukhi mala) goes in "not_carried".
- weight_ratti = weight of ONE gemstone in ratti. Convert carat to ratti by dividing by 0.91. "sava 5" = 5.25, "sade 5" = 5.5, "paune 6" = 5.75.
- pieces = number of stones / beads / malas / pujas. Only use numbers the customer actually wrote. Use null when not given.
- Never include prices. Never guess.
- Intent guide: complaint (damaged, fake, wrong, late, refund), order_status (where is my order / tracking), white_label (custom packaging, own logo/brand), bulk_order (wholesale or large quantity), puja_booking, order_request (wants to buy), price_enquiry, availability, authenticity (certificate / original?), greeting, general.`;

async function understand(message) {
  const text = await complete({ system: UNDERSTAND_SYSTEM(), user: `Customer message:\n"""${message}"""`, json: true, temperature: 0 });
  return parseJSONLoose(text);
}

const LANGUAGE_NAME = { en: 'English', hinglish: 'Hinglish (Hindi written in Roman/English letters)', hi: 'Hindi in Devanagari script' };

const POLISH_SYSTEM = `You are a polite, warm sales executive at Remedy Setu replying on WhatsApp.
You will receive the customer's message and a DRAFT REPLY that contains verified prices from our price list.
Rewrite the draft so it reads naturally and personally, like a real person typed it, in the requested language.

STRICT RULES:
- Keep every product name, price, quantity and total EXACTLY as in the draft. Do not change, round or recalculate any number.
- Do NOT add any product, price, number, discount, offer, guarantee, delivery date or promise that is not in the draft.
- Do NOT remove any price line or any question the draft asks the customer.
- Keep WhatsApp formatting short: bullet lines are fine, no markdown headings, no tables.
- Output ONLY the reply text.`;

async function polishReply({ message, draft, language }) {
  const user = `Language to reply in: ${LANGUAGE_NAME[language] || 'English'}\n\nCustomer message:\n"""${message}"""\n\nDRAFT REPLY:\n"""${draft}"""`;
  const text = await complete({ system: POLISH_SYSTEM, user, temperature: 0.4 });
  return text.replace(/^"""|"""$/g, '').trim();
}

module.exports = { understand, polishReply, UNDERSTAND_SYSTEM, POLISH_SYSTEM };
