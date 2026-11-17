// Loads the price list (the single source of truth for products and prices)
// and does all price maths. Nothing else in the app is allowed to invent a price.
const fs = require('fs');
const path = require('path');

const PRICE_LIST_PATH = path.join(__dirname, '..', 'data', 'price-list.json');

let cache = null;

function loadCatalog() {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(PRICE_LIST_PATH, 'utf8'));
  validateCatalog(raw);
  const byId = new Map(raw.products.map((p) => [p.id, p]));
  cache = { meta: raw.meta, products: raw.products, byId };
  return cache;
}

// Fail fast at startup if someone edits the JSON badly.
function validateCatalog(raw) {
  const ids = new Set();
  for (const p of raw.products) {
    if (!p.id || ids.has(p.id)) throw new Error(`Price list: missing/duplicate id ${p.id}`);
    ids.add(p.id);
    if (!Array.isArray(p.tiers) || p.tiers.length === 0) throw new Error(`Price list: ${p.id} has no tiers`);
    let lastMin = 0;
    for (const t of p.tiers) {
      if (!(t.min > lastMin) || !(t.price > 0)) throw new Error(`Price list: ${p.id} tiers must have increasing min and positive price`);
      lastMin = t.min;
    }
  }
}

function getProduct(id) {
  return loadCatalog().byId.get(id) || null;
}

// Highest tier whose minimum is <= quantity.
function tierFor(product, quantity) {
  let chosen = product.tiers[0];
  for (const t of product.tiers) if (quantity >= t.min) chosen = t;
  return chosen;
}

function nextTier(product, quantity) {
  return product.tiers.find((t) => t.min > quantity) || null;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Turn a parsed item into a priced line.
 * item = { productId, pieces?, weight? (ratti, gemstones only), assumptions: [] }
 * Gemstones are priced per ratti: billable qty = pieces x weight-per-piece.
 * Everything else is priced per unit (piece / mala / puja).
 */
function priceLine(item) {
  const product = getProduct(item.productId);
  if (!product) return null; // never price something that isn't in the list

  const line = {
    productId: product.id,
    category: product.category,
    name: product.name,
    unit: product.unit,
    url: product.url,
    note: product.note,
    inStock: product.inStock,
    tiers: product.tiers,
    pieces: item.pieces || null,
    weight: item.weight || null,
    assumptions: [...(item.assumptions || [])],
    needs: [],
  };

  let billableQty = null;
  if (product.unit === 'ratti') {
    if (item.weight) billableQty = round2((item.pieces || 1) * item.weight);
    else line.needs.push('weight');
  } else {
    billableQty = item.pieces || 1;
    if (!item.pieces) line.assumptions.push('quantity_assumed_1');
  }

  line.billableQty = billableQty;
  const tier = tierFor(product, billableQty || 1);
  line.unitPrice = tier.price;
  line.tierMin = tier.min;
  line.total = billableQty ? Math.round(tier.price * billableQty) : null;
  const nt = billableQty ? nextTier(product, billableQty) : null;
  line.nextTier = nt ? { min: nt.min, price: nt.price } : null;
  line.bulkTier = product.tiers.length > 1 && tier.min > 1;
  return line;
}

const formatINR = (n) => '₹' + Number(n).toLocaleString('en-IN');

module.exports = { loadCatalog, getProduct, priceLine, tierFor, formatINR };
