// Orchestrates one analysis:
//   rules parse  ->  (optional) AI understanding, validated  ->  price from catalogue
//   ->  template reply  ->  (optional) AI polish, validated  ->  result
// Any AI failure falls back to the rule-based result, so the agent always gets an answer.
const { parseMessage, normalize, INTENT_LABELS } = require('./parser');
const { priceLine, loadCatalog } = require('./catalog');
const { buildTemplateReply } = require('./replies');
const { validateExtraction, validateReply } = require('./guardrails');
const llm = require('./llm');
const ai = require('./ai');

// An AI-found product is only accepted if the message actually mentions it somehow.
function hasEvidence(productId, normalizedText) {
  const p = loadCatalog().byId.get(productId);
  if (!p) return false;
  if (p.rudraksha) {
    if (!/rudra|रुद्र|रूद्र|mukhi|मुखी/.test(normalizedText)) return false;
    const mukhi = normalizedText.match(/(\d+)\s*-?\s*(?:mukhi|mukhee|mukh|मुखी)/);
    if (mukhi && Number(mukhi[1]) !== p.rudraksha.mukhi) return false;
    const isMala = /mala|maala|माला/.test(normalizedText);
    return p.rudraksha.form === 'mala' ? isMala : true;
  }
  // aliases hold every local/English name; allow small spelling differences by matching the stem
  return p.aliases.map(normalize).some((a) => normalizedText.includes(a.length >= 6 ? a.slice(0, a.length - 2) : a));
}

function mergeItems(ruleItems, aiItems, normalizedText, guardLog) {
  const merged = ruleItems.map((i) => ({ ...i, assumptions: [...i.assumptions] }));
  for (const a of aiItems) {
    const existing = merged.find((m) => m.productId === a.productId);
    if (existing) {
      if (!existing.weight && a.weight) { existing.weight = a.weight; existing.assumptions.push('weight_from_ai'); }
      if (!existing.pieces && a.pieces) { existing.pieces = a.pieces; existing.assumptions.push('pieces_from_ai'); }
      continue;
    }
    if (!hasEvidence(a.productId, normalizedText)) {
      guardLog.push({ level: 'blocked', message: `AI picked ${a.productId} but the message does not mention it — removed` });
      continue;
    }
    guardLog.push({ level: 'ok', message: `AI found ${a.productId} that the rules missed` });
    merged.push(a);
  }
  return merged;
}

async function analyzeMessage(message, { includeLinks = false, useAI = true, customerName = null } = {}) {
  const started = Date.now();
  const rules = parseMessage(message);
  const guardrails = [];
  const aiOn = useAI && llm.isEnabled();
  const engine = { mode: aiOn ? 'ai+rules' : 'rules', provider: aiOn ? llm.getConfig().provider : null, model: aiOn ? llm.getConfig().model : null, understanding: 'rules', reply: 'template' };

  let intent = rules.intent;
  let secondaryIntents = rules.secondaryIntents;
  let items = rules.items;
  let notCarried = rules.notCarried;
  const customer = { ...rules.customer };
  if (customerName) customer.name = String(customerName).replace(/\s+ji$/i, '').trim().slice(0, 60);
  let confidence = rules.confidence;

  if (aiOn) {
    try {
      const raw = await ai.understand(message);
      const { value, log } = validateExtraction(raw, message);
      guardrails.push(...log);
      if (value.intent) {
        intent = value.intent;
        secondaryIntents = [...new Set([...value.secondaryIntents, ...rules.secondaryIntents, rules.intent])].filter((i) => i !== intent && i !== 'general' && i !== 'greeting');
      }
      items = mergeItems(rules.items, value.items, rules.normalized, guardrails);
      // keep "not carried" items only if they are not actually something we sell
      const reallyNotCarried = value.notCarried.filter((term) => parseMessage(term).items.length === 0);
      notCarried = [...new Set([...rules.notCarried, ...reallyNotCarried])];
      if (value.intent === rules.intent) confidence = Math.max(confidence, 0.92);
      if (!customer.name && value.customer.name) customer.name = value.customer.name;
      if (!customer.city && value.customer.city) customer.city = value.customer.city;
      engine.understanding = 'ai';
    } catch (e) {
      guardrails.push({ level: 'warn', message: `AI understanding failed (${e.message.slice(0, 120)}) — used rule engine` });
    }
  }

  const lines = items.map(priceLine).filter(Boolean);
  const analysis = { intent, secondaryIntents, language: rules.language, lines, notCarried, customer, pujaGeneric: rules.pujaGeneric && !lines.some((l) => l.category === 'puja'), complaintType: rules.complaintType || 'product' };
  const draft = buildTemplateReply(analysis, { includeLinks });
  let reply = draft;

  if (aiOn) {
    try {
      const polished = await ai.polishReply({ message, draft, language: rules.language });
      const check = validateReply(polished, { draft, message, lines });
      if (check.ok) {
        reply = polished;
        engine.reply = 'ai';
        guardrails.push({ level: 'ok', message: 'AI reply passed checks: every price and product matches the price list' });
      } else {
        guardrails.push(...check.problems.map((p) => ({ level: 'blocked', message: `${p} — AI reply rejected, using verified template` })));
      }
    } catch (e) {
      guardrails.push({ level: 'warn', message: `AI reply failed (${e.message.slice(0, 120)}) — used verified template` });
    }
  }

  const priced = lines.filter((l) => l.total);
  return {
    message,
    language: rules.language,
    intent,
    intentLabel: INTENT_LABELS[intent] || intent,
    secondaryIntents,
    secondaryLabels: secondaryIntents.map((i) => INTENT_LABELS[i] || i),
    confidence,
    lines,
    grandTotal: priced.length ? priced.reduce((s, l) => s + l.total, 0) : null,
    notCarried,
    customer,
    reply,
    draftReply: draft,
    engine,
    guardrails,
    ms: Date.now() - started,
  };
}

module.exports = { analyzeMessage, hasEvidence };
