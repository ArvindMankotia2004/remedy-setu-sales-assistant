// Remedy Setu – AI Sales Reply Assistant
// Express server: serves the web UI and a small JSON API.
const fs = require('fs');
const path = require('path');

// Load .env without extra dependencies (KEY=value lines).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = require('express');
const { analyzeMessage } = require('./src/analyze');
const { loadCatalog } = require('./src/catalog');
const store = require('./src/store');
const llm = require('./src/llm');

const app = express();
app.use(express.json({ limit: '100kb' }));

// Optional login: set APP_PASSWORD in .env to protect the whole tool (username: sales).
if (process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const [, encoded] = (req.headers.authorization || '').split(' ');
    const [, pass] = Buffer.from(encoded || '', 'base64').toString().split(':');
    if (pass === process.env.APP_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Remedy Setu Sales"').status(401).send('Login required');
  });
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  const cfg = llm.getConfig();
  res.json({ ok: true, ai: cfg.provider !== 'none', provider: cfg.provider, model: cfg.model || null, products: loadCatalog().products.length });
});

app.get('/api/catalog', (req, res) => {
  const { meta, products } = loadCatalog();
  res.json({ meta, products });
});

app.post('/api/analyze', async (req, res) => {
  const { message, customerName, phone, city, saveLead = true, includeLinks = false, useAI = true } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Please paste a customer message' });
  if (message.length > 3000) return res.status(400).json({ error: 'Message is too long (max 3000 characters)' });
  try {
    const result = await analyzeMessage(message.trim(), { includeLinks: !!includeLinks, useAI: useAI !== false, customerName });
    if (saveLead) result.lead = store.saveQuery(result, { name: result.customer.name, phone, city });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong while analysing the message' });
  }
});

app.get('/api/leads', (req, res) => {
  res.json({ leads: store.listLeads(req.query), stats: store.stats(), statuses: store.STATUSES });
});

app.get('/api/leads.csv', (req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="remedy-setu-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(store.toCSV(store.listLeads(req.query)));
});

app.patch('/api/leads/:id', (req, res) => {
  try {
    const lead = store.updateLead(req.params.id, req.body || {});
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/leads/:id', (req, res) => {
  if (!store.deleteLead(req.params.id)) return res.status(404).json({ error: 'Lead not found' });
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  loadCatalog(); // validate price list at startup
  app.listen(PORT, () => {
    const cfg = llm.getConfig();
    console.log(`\n  Remedy Setu Sales Reply Assistant running at http://localhost:${PORT}`);
    console.log(`  AI: ${cfg.provider === 'none' ? 'OFF (rule engine only — add a key in .env to enable)' : `${cfg.provider} / ${cfg.model}`}\n`);
  });
}

module.exports = app;
