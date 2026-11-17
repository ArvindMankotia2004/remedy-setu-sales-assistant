// Template replies in English, Hinglish and Hindi.
// Every price/product in a reply comes from the priced lines (catalogue), never typed by hand.
const { loadCatalog, formatINR } = require('./catalog');

const UNIT_TEXT = {
  en: { ratti: 'ratti', piece: 'pc', pieces: 'pcs', mala: 'mala', malas: 'malas', puja: 'puja' },
  hinglish: { ratti: 'ratti', piece: 'pc', pieces: 'pcs', mala: 'mala', malas: 'mala', puja: 'puja' },
  hi: { ratti: 'रत्ती', piece: 'पीस', pieces: 'पीस', mala: 'माला', malas: 'माला', puja: 'पूजा' },
};

const T = {
  en: {
    hello: (n) => `Namaste${n ? ' ' + n + ' ji' : ''} 🙏\nThank you for contacting Remedy Setu.`,
    quoteIntro: 'Here are our rates:',
    bulkRate: 'bulk rate',
    tiersLabel: 'Tier rates',
    nextTier: (min, units, price, unit) => `${min}+ ${units}: ${price}/${unit}`,
    askWeight: 'Please tell us the weight (in ratti) you need.',
    askMukhi: 'Which mukhi do you need? We have shared the rate for 5 Mukhi (most popular).',
    grandTotal: 'Total',
    notCarried: (x) => `Sorry, ${x} is not in our current price list.`,
    available: 'Yes, available in stock.',
    closeOrder: 'Please confirm the quantity and delivery city to place the order.',
    closePuja: 'To book, please share the preferred date, and name and gotra for the sankalp.',
    pujaList: 'We perform these pujas (online/offline, video shared):',
    complaint: (h) => `We are very sorry for the trouble. Please share your Order ID and a photo/video of the product. Our team will resolve this within ${h} hours.`,
    complaintDelivery: (h) => `We are sorry for the delay. Please share your Order ID or registered phone number — we will check with the courier and update you within ${h} hours.`,
    orderStatus: 'Please share your Order ID or registered phone number and we will send you the latest tracking details.',
    whiteLabel: 'Yes, we offer custom packaging and white-labelling for bulk partners. Our key-accounts team will contact you. Please share the products, quantity and your city.',
    authAsk: 'Please tell us which product you are asking about and we will share its details.',
    general: 'We supply gemstones, rudraksha, malas, yantras and puja services at B2B tier prices. What are you looking for?',
    convertedCarat: (ct, r) => `${ct} carat ≈ ${r} ratti`,
    link: 'Details',
  },
  hinglish: {
    hello: (n) => `Namaste${n ? ' ' + n : ''} ji 🙏\nRemedy Setu se sampark karne ke liye dhanyavaad.`,
    quoteIntro: 'Aapke liye rate:',
    bulkRate: 'bulk rate',
    tiersLabel: 'Tier rate',
    nextTier: (min, units, price, unit) => `${min}+ ${units}: ${price}/${unit}`,
    askWeight: 'Aapko kitne ratti ka stone chahiye? Bata dijiye.',
    askMukhi: 'Aapko kaunse mukhi ka rudraksha chahiye? Abhi 5 Mukhi (sabse popular) ka rate bheja hai.',
    grandTotal: 'Total',
    notCarried: (x) => `Maaf kijiye, ${x} abhi hamari price list mein nahi hai.`,
    available: 'Haan ji, stock mein available hai.',
    closeOrder: 'Order confirm karne ke liye quantity aur delivery city bata dijiye.',
    closePuja: 'Booking ke liye date, aur sankalp ke liye naam aur gotra bhej dijiye.',
    pujaList: 'Hum ye pujayein karwate hain (online/offline, video share hota hai):',
    complaint: (h) => `Asuvidha ke liye hume bahut khed hai. Kripya apna Order ID aur product ki photo/video bhej dijiye. Hamari team ${h} ghante ke andar solve karegi.`,
    complaintDelivery: (h) => `Delay ke liye hume khed hai. Kripya apna Order ID ya registered mobile number bhej dijiye — hum courier se check karke ${h} ghante ke andar update denge.`,
    orderStatus: 'Kripya apna Order ID ya registered mobile number bhej dijiye, hum turant latest tracking details share karenge.',
    whiteLabel: 'Ji haan, bulk partners ke liye custom packaging aur white-labelling available hai. Hamari key-accounts team aapse sampark karegi. Kripya products, quantity aur city bata dijiye.',
    authAsk: 'Kaunse product ke baare mein jaankari chahiye? Bata dijiye, hum details share karenge.',
    general: 'Hum gemstones, rudraksha, mala, yantra aur puja services B2B tier rates par dete hain. Aapko kya chahiye?',
    convertedCarat: (ct, r) => `${ct} carat ≈ ${r} ratti`,
    link: 'Details',
  },
  hi: {
    hello: (n) => `नमस्ते${n ? ' ' + n : ''} जी 🙏\nरेमेडी सेतु से संपर्क करने के लिए धन्यवाद।`,
    quoteIntro: 'आपके लिए रेट:',
    bulkRate: 'बल्क रेट',
    tiersLabel: 'टियर रेट',
    nextTier: (min, units, price, unit) => `${min}+ ${units}: ${price}/${unit}`,
    askWeight: 'आपको कितने रत्ती का स्टोन चाहिए? कृपया बताइए।',
    askMukhi: 'आपको कौन से मुखी का रुद्राक्ष चाहिए? अभी 5 मुखी (सबसे लोकप्रिय) का रेट भेजा है।',
    grandTotal: 'कुल',
    notCarried: (x) => `क्षमा कीजिए, ${x} अभी हमारी प्राइस लिस्ट में नहीं है।`,
    available: 'जी हाँ, स्टॉक में उपलब्ध है।',
    closeOrder: 'ऑर्डर कन्फर्म करने के लिए मात्रा और डिलीवरी शहर बता दीजिए।',
    closePuja: 'बुकिंग के लिए तारीख, और संकल्प के लिए नाम और गोत्र भेज दीजिए।',
    pujaList: 'हम ये पूजाएँ करवाते हैं (ऑनलाइन/ऑफलाइन, वीडियो शेयर होता है):',
    complaint: (h) => `असुविधा के लिए हमें खेद है। कृपया अपना ऑर्डर ID और प्रोडक्ट की फोटो/वीडियो भेजें। हमारी टीम ${h} घंटे के अंदर समाधान करेगी।`,
    complaintDelivery: (h) => `देरी के लिए हमें खेद है। कृपया अपना ऑर्डर ID या रजिस्टर्ड मोबाइल नंबर भेजें — हम कूरियर से जाँच करके ${h} घंटे के अंदर अपडेट देंगे।`,
    orderStatus: 'कृपया अपना ऑर्डर ID या रजिस्टर्ड मोबाइल नंबर भेजें, हम तुरंत ट्रैकिंग डिटेल्स भेजेंगे।',
    whiteLabel: 'जी हाँ, बल्क पार्टनर्स के लिए कस्टम पैकेजिंग और व्हाइट-लेबलिंग उपलब्ध है। हमारी की-अकाउंट्स टीम आपसे संपर्क करेगी। कृपया प्रोडक्ट, मात्रा और शहर बताइए।',
    authAsk: 'किस प्रोडक्ट के बारे में जानकारी चाहिए? बताइए, हम डिटेल्स भेजेंगे।',
    general: 'हम रत्न, रुद्राक्ष, माला, यंत्र और पूजा सेवाएँ B2B टियर रेट पर देते हैं। आपको क्या चाहिए?',
    convertedCarat: (ct, r) => `${ct} कैरेट ≈ ${r} रत्ती`,
    link: 'डिटेल्स',
  },
};

function unitLabel(lang, unit, qty) {
  const u = UNIT_TEXT[lang];
  if (unit === 'piece') return qty && qty > 1 ? u.pieces : u.piece;
  if (unit === 'mala') return qty && qty > 1 ? u.malas : u.mala;
  return u[unit] || unit;
}

const fmtNum = (n) => Number(n).toLocaleString('en-IN');

function tierSummary(line, lang) {
  return line.tiers.slice(1).map((t) => T[lang].nextTier(t.min, unitLabel(lang, line.unit, 2), formatINR(t.price), unitLabel(lang, line.unit, 1))).join(', ');
}

function formatLine(line, lang, includeLinks) {
  const t = T[lang];
  const name = line.name[lang] || line.name.en;
  const rows = [];
  const u1 = unitLabel(lang, line.unit, 1);

  if (line.category === 'puja') {
    rows.push(`• ${name} — ${formatINR(line.unitPrice)}${line.pieces > 1 ? ` × ${line.pieces} = ${formatINR(line.total)}` : ''}`);
  } else if (line.unit === 'ratti' && !line.billableQty) {
    rows.push(`• ${name}${line.pieces ? ` — ${line.pieces} ${unitLabel(lang, 'piece', line.pieces)}` : ''}`);
    rows.push(`   ${formatINR(line.unitPrice)}/${u1}  (${t.tiersLabel}: ${tierSummary(line, lang)})`);
  } else if (line.unit === 'ratti') {
    const carat = line.assumptions.find((a) => a.startsWith('converted_from_carat:'));
    const qtyText = line.pieces && line.pieces > 1
      ? `${line.pieces} ${unitLabel(lang, 'piece', line.pieces)} × ${fmtNum(line.weight)} ${u1} = ${fmtNum(line.billableQty)} ${u1}`
      : `${fmtNum(line.weight)} ${u1}` + (carat ? ` (${t.convertedCarat(carat.split(':')[1], line.weight)})` : '');
    rows.push(`• ${name} — ${qtyText}`);
    rows.push(`   ${formatINR(line.unitPrice)}/${u1} × ${fmtNum(line.billableQty)} = ${formatINR(line.total)}${line.bulkTier ? ` (${t.bulkRate})` : ''}`);
  } else if (line.assumptions.includes('quantity_assumed_1')) {
    rows.push(`• ${name} — ${formatINR(line.unitPrice)}/${u1}`);
    if (line.tiers.length > 1) rows.push(`   (${t.tiersLabel}: ${tierSummary(line, lang)})`);
  } else {
    const uq = unitLabel(lang, line.unit, line.billableQty);
    rows.push(`• ${name} — ${fmtNum(line.billableQty)} ${uq}`);
    rows.push(`   ${formatINR(line.unitPrice)}/${u1} × ${fmtNum(line.billableQty)} = ${formatINR(line.total)}${line.bulkTier ? ` (${t.bulkRate})` : ''}`);
  }

  if (line.nextTier && line.billableQty && line.category !== 'puja' && !line.assumptions.includes('quantity_assumed_1')) {
    rows.push(`   ${t.nextTier(line.nextTier.min, unitLabel(lang, line.unit, 2), formatINR(line.nextTier.price), u1)}`);
  }
  if (includeLinks && line.url) rows.push(`   ${t.link}: ${line.url}`);
  return rows.join('\n');
}

/**
 * Build the WhatsApp reply from verified facts only.
 * analysis = { intent, secondaryIntents, language, lines, notCarried, customer, pujaGeneric }
 */
function buildTemplateReply(analysis, { includeLinks = false } = {}) {
  const lang = T[analysis.language] ? analysis.language : 'en';
  const t = T[lang];
  const { meta, products } = loadCatalog();
  const intents = [analysis.intent, ...(analysis.secondaryIntents || [])];
  const has = (i) => intents.includes(i);
  const lines = analysis.lines || [];
  const parts = [t.hello(analysis.customer && analysis.customer.name)];

  if (analysis.intent === 'complaint') {
    parts.push(analysis.complaintType === 'delivery' ? t.complaintDelivery(meta.complaintResponseHours) : t.complaint(meta.complaintResponseHours));
    return parts.join('\n\n');
  }
  if (analysis.intent === 'order_status') {
    parts.push(t.orderStatus);
    return parts.join('\n\n');
  }
  if (has('white_label')) parts.push(t.whiteLabel);

  if (lines.length) {
    const body = [t.quoteIntro, ...lines.map((l) => formatLine(l, lang, includeLinks))];
    const priced = lines.filter((l) => l.total);
    if (priced.length > 1) body.push(`\n${t.grandTotal}: ${formatINR(priced.reduce((s, l) => s + l.total, 0))}`);
    parts.push(body.join('\n'));

    const notes = [...new Set(lines.map((l) => l.note).filter(Boolean))];
    if (has('authenticity') && notes.length) parts.push(notes.map((n) => `✔ ${n}`).join('\n'));
    if (has('availability') && lines.every((l) => l.inStock)) parts.push(t.available);
  }

  if (analysis.pujaGeneric && !lines.some((l) => l.category === 'puja')) {
    const pujas = products.filter((p) => p.category === 'puja');
    parts.push([t.pujaList, ...pujas.map((p) => `• ${p.name[lang] || p.name.en} — ${formatINR(p.tiers[0].price)}`)].join('\n'));
  }

  for (const x of analysis.notCarried || []) parts.push(t.notCarried(x));

  const questions = [];
  if (lines.some((l) => l.needs.includes('weight'))) questions.push(t.askWeight);
  if (lines.some((l) => l.assumptions.includes('mukhi_assumed_5'))) questions.push(t.askMukhi);
  if (questions.length) parts.push(questions.join('\n'));

  if (!lines.length && !analysis.pujaGeneric && !has('white_label')) {
    parts.push(analysis.intent === 'authenticity' ? t.authAsk : t.general);
  } else if (lines.length || analysis.pujaGeneric) {
    if (lines.some((l) => l.total || l.unitPrice)) parts.push(meta.priceNote[lang] || meta.priceNote.en);
    parts.push(lines.some((l) => l.category === 'puja') || analysis.pujaGeneric ? t.closePuja : t.closeOrder);
  }
  return parts.join('\n\n');
}

module.exports = { buildTemplateReply, formatLine };
