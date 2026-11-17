// Leads storage in a JSON file (data/leads.json). No database setup needed to run locally.
// Writes are atomic (write temp file, then rename) so a crash can't corrupt the file.
// Swap this module for Postgres/Supabase in production; the rest of the app only uses these functions.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.LEADS_FILE || path.join(__dirname, '..', 'data', 'leads.json');
const STATUSES = ['New', 'Contacted', 'Quoted', 'Won', 'Lost'];

function readAll() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}

function writeAll(leads) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(leads, null, 2));
  fs.renameSync(tmp, FILE);
}

function summarizeQuery(result) {
  return {
    at: new Date().toISOString(),
    message: result.message,
    intent: result.intent,
    language: result.language,
    products: result.lines.map((l) => ({ id: l.productId, name: l.name.en, qty: l.billableQty, unit: l.unit, unitPrice: l.unitPrice, total: l.total })),
    notCarried: result.notCarried,
    quoteTotal: result.grandTotal,
    reply: result.reply,
  };
}

/** Save a query. If the phone number is already a lead, the query is added to that lead. */
function saveQuery(result, { name, phone, city } = {}) {
  const leads = readAll();
  const cleanPhone = (phone || result.customer.phone || '').replace(/\D/g, '').slice(-10) || null;
  const query = summarizeQuery(result);
  let lead = cleanPhone ? leads.find((l) => l.phone === cleanPhone) : null;
  const now = new Date().toISOString();

  if (lead) {
    lead.queries.unshift(query);
    lead.updatedAt = now;
    lead.lastIntent = result.intent;
    if (name && !lead.name) lead.name = name;
    if ((city || result.customer.city) && !lead.city) lead.city = city || result.customer.city;
    lead.returning = true;
  } else {
    lead = {
      id: crypto.randomUUID().slice(0, 8),
      name: name || result.customer.name || '',
      phone: cleanPhone,
      city: city || result.customer.city || '',
      status: result.lines.some((l) => l.total) ? 'Quoted' : 'New',
      notes: '',
      lastIntent: result.intent,
      createdAt: now,
      updatedAt: now,
      queries: [query],
    };
    leads.unshift(lead);
  }
  writeAll(leads);
  return lead;
}

function listLeads({ q, status, intent } = {}) {
  let leads = readAll();
  if (status) leads = leads.filter((l) => l.status === status);
  if (intent) leads = leads.filter((l) => l.queries.some((x) => x.intent === intent));
  if (q) {
    const s = q.toLowerCase();
    leads = leads.filter((l) => [l.name, l.phone, l.city, l.notes, ...l.queries.map((x) => x.message)].join(' ').toLowerCase().includes(s));
  }
  return leads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function updateLead(id, patch) {
  const leads = readAll();
  const lead = leads.find((l) => l.id === id);
  if (!lead) return null;
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw new Error('Invalid status');
    lead.status = patch.status;
  }
  for (const k of ['name', 'city', 'notes']) if (typeof patch[k] === 'string') lead[k] = patch[k].slice(0, 2000);
  if (typeof patch.phone === 'string') lead.phone = patch.phone.replace(/\D/g, '').slice(-10) || null;
  lead.updatedAt = new Date().toISOString();
  writeAll(leads);
  return lead;
}

function deleteLead(id) {
  const leads = readAll();
  const next = leads.filter((l) => l.id !== id);
  if (next.length === leads.length) return false;
  writeAll(next);
  return true;
}

function toCSV(leads) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', 'name', 'phone', 'city', 'status', 'last_intent', 'queries', 'last_message', 'last_quote_total', 'notes', 'created_at', 'updated_at'];
  const rows = leads.map((l) => [l.id, l.name, l.phone, l.city, l.status, l.lastIntent, l.queries.length, l.queries[0]?.message, l.queries[0]?.quoteTotal, l.notes, l.createdAt, l.updatedAt].map(esc).join(','));
  return '﻿' + [head.join(','), ...rows].join('\n'); // BOM so Excel shows Hindi correctly
}

function stats() {
  const leads = readAll();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const byIntent = {};
  for (const l of leads) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    for (const q of l.queries) byIntent[q.intent] = (byIntent[q.intent] || 0) + 1;
  }
  return { total: leads.length, byStatus, byIntent };
}

module.exports = { saveQuery, listLeads, updateLead, deleteLead, toCSV, stats, STATUSES };
