// Front-end for the Sales Reply Assistant. Plain JavaScript, no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
const LANG = { en: 'English', hinglish: 'Hinglish', hi: 'Hindi' };
const UNIT = { ratti: 'ratti', piece: 'pc', mala: 'mala', puja: 'puja' };
const INTENT_LABELS = {
  complaint: 'Complaint', order_status: 'Order status', white_label: 'White-label', bulk_order: 'Bulk order', puja_booking: 'Puja booking',
  order_request: 'Order request', price_enquiry: 'Price enquiry', availability: 'Availability', authenticity: 'Authenticity', greeting: 'Greeting', general: 'General',
};

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

// ---------------- tabs ----------------
function showTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'leads') loadLeads();
  if (name === 'prices') loadPrices();
  history.replaceState(null, '', '#' + name);
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------------- health ----------------
let aiAvailable = false;
api('/api/health').then((h) => {
  aiAvailable = h.ai;
  const el = $('#aiStatus');
  el.className = 'pill ' + (h.ai ? 'pill-on' : 'pill-off');
  el.textContent = h.ai ? `AI on · ${h.provider}` : 'Rules mode (no AI key)';
  el.title = h.ai ? `Model: ${h.model}` : 'Add an API key in .env to turn on AI. The tool still works fully with the built-in rule engine.';
  if (!h.ai) $('#useAIWrap').hidden = true;
}).catch(() => {});

// ---------------- assistant ----------------
$$('.chip[data-sample]').forEach((c) => c.addEventListener('click', () => { $('#message').value = c.dataset.sample; analyze(); }));
$('#analyzeBtn').addEventListener('click', analyze);
$('#message').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze(); });

let lastResult = null;

async function analyze() {
  const message = $('#message').value.trim();
  const err = $('#error');
  err.hidden = true;
  if (!message) { err.textContent = 'Please paste a customer message first.'; err.hidden = false; return; }
  const btn = $('#analyzeBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Reading message…';
  try {
    const r = await api('/api/analyze', {
      method: 'POST',
      body: {
        message,
        customerName: $('#custName').value.trim() || undefined,
        phone: $('#custPhone').value.trim() || undefined,
        city: $('#custCity').value.trim() || undefined,
        saveLead: $('#saveLead').checked,
        includeLinks: $('#includeLinks').checked,
        useAI: $('#useAI').checked,
      },
    });
    lastResult = r;
    renderResult(r);
    if (r.lead) refreshLeadCount();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Generate reply <span class="kbd">Ctrl ↵</span>';
  }
}

function flagsFor(line) {
  const f = [];
  for (const a of line.assumptions) {
    if (a === 'mukhi_assumed_5') f.push(['Mukhi not given — 5 Mukhi assumed', '']);
    else if (a === 'number_read_as_ratti') f.push(['Number read as ratti', '']);
    else if (a === 'quantity_assumed_1') f.push(['Qty not given — unit rate', 'info']);
    else if (a.startsWith('spelling_matched:')) f.push([`Matched spelling "${a.split(':')[1]}"`, 'info']);
    else if (a.startsWith('converted_from_carat:')) f.push([`${a.split(':')[1]} carat → ${line.weight} ratti`, 'info']);
    else if (a === 'from_ai' || a.endsWith('_from_ai')) f.push(['Found by AI · verified', 'info']);
  }
  if (line.needs.includes('weight')) f.push(['Weight needed', '']);
  return f.map(([t, c]) => `<span class="flag ${c}">${esc(t)}</span>`).join('');
}

function qtyText(l) {
  if (l.category === 'puja') return `${l.pieces || 1} puja`;
  if (l.unit === 'ratti') {
    if (!l.billableQty) return l.pieces ? `${l.pieces} pcs · weight?` : 'weight?';
    return l.pieces > 1 ? `${l.pieces} × ${l.weight} = ${l.billableQty} ratti` : `${l.weight} ratti`;
  }
  return `${l.billableQty} ${l.unit === 'piece' ? 'pcs' : l.unit}`;
}

function renderResult(r) {
  const phone = ($('#custPhone').value || r.customer.phone || (r.lead && r.lead.phone) || '').replace(/\D/g, '').slice(-10);
  const engineBadge = r.engine.understanding === 'ai' || r.engine.reply === 'ai'
    ? `<span class="badge badge-ai">AI: ${esc(r.engine.provider)} · reply ${r.engine.reply === 'ai' ? 'AI-written ✓' : 'template'}</span>`
    : '<span class="badge badge-rules">Rule engine</span>';

  const rows = r.lines.map((l) => `
    <tr>
      <td class="prod-name"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name.en)}</a>
        <div class="flags">${flagsFor(l)}</div></td>
      <td>${esc(qtyText(l))}</td>
      <td class="num">${inr(l.unitPrice)}/${UNIT[l.unit]}${l.bulkTier ? `<span class="tier-tag">${l.tierMin}+ tier</span>` : ''}
        ${l.nextTier ? `<div class="muted small">${l.nextTier.min}+: ${inr(l.nextTier.price)}</div>` : ''}</td>
      <td class="num">${inr(l.total)}</td>
    </tr>`).join('');

  $('#result').innerHTML = `
    <h3>Detected</h3>
    <div class="badges">
      <span class="badge badge-intent ${esc(r.intent)}">${esc(r.intentLabel)}</span>
      ${r.secondaryIntents.map((i) => `<span class="badge badge-sec">+ ${esc(INTENT_LABELS[i] || i)}</span>`).join('')}
      <span class="badge">🗣 ${LANG[r.language] || r.language}</span>
      <span class="badge" title="How sure the tool is about the intent">${Math.round(r.confidence * 100)}% sure</span>
      ${engineBadge}
    </div>
    ${r.customer.name || r.customer.city || r.customer.phone ? `<p class="muted small">Customer: ${esc([r.customer.name, r.customer.phone, r.customer.city].filter(Boolean).join(' · '))}</p>` : ''}

    <h3>Matching products & tier price</h3>
    ${r.lines.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      ${r.grandTotal && r.lines.length > 1 ? `<tfoot><tr><td colspan="3">Total (before GST)</td><td class="num">${inr(r.grandTotal)}</td></tr></tfoot>` : ''}
    </table></div>` : '<p class="muted">No product from the price list in this message.</p>'}
    ${r.notCarried.length ? `<div class="alert alert-warn">⚠ Not in our price list: <strong>${r.notCarried.map(esc).join(', ')}</strong> — the reply tells the customer instead of guessing.</div>` : ''}

    <h3>Ready-to-send reply</h3>
    <div class="reply-box"><textarea id="replyText" spellcheck="false">${esc(r.reply)}</textarea></div>
    <div class="reply-actions">
      <button class="btn btn-primary" id="copyBtn">📋 Copy reply</button>
      <a class="btn btn-wa" id="waBtn" target="_blank" rel="noopener">WhatsApp ${phone ? 'to ' + esc(phone) : ''}</a>
      ${r.engine.reply === 'ai' ? '<button class="btn btn-ghost" id="draftBtn">Use verified template instead</button>' : ''}
    </div>
    ${r.lead ? `<p class="lead-saved">✔ Saved to leads${r.lead.queries.length > 1 ? ' (returning customer — added to their history)' : ''} · <a href="#leads" id="goLeads">open lead</a></p>` : ''}

    <details class="guard">
      <summary>🛡 How this answer was checked (${r.guardrails.length + 2} checks · ${r.ms} ms)</summary>
      <ul>
        <li class="ok">All prices calculated by code from the price list (data/price-list.json), not by AI</li>
        <li class="ok">Tier picked from total quantity; unknown products are reported, never substituted</li>
        ${r.guardrails.map((g) => `<li class="${esc(g.level)}">${esc(g.message)}</li>`).join('')}
      </ul>
    </details>`;

  const setWa = () => {
    const text = encodeURIComponent($('#replyText').value);
    $('#waBtn').href = phone ? `https://wa.me/91${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  };
  const fit = () => { const t = $('#replyText'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 4, 700) + 'px'; };
  setWa();
  fit();
  $('#replyText').addEventListener('input', () => { setWa(); fit(); });
  $('#copyBtn').addEventListener('click', async () => {
    const text = $('#replyText').value;
    try { await navigator.clipboard.writeText(text); } catch { $('#replyText').select(); document.execCommand('copy'); }
    toast('Reply copied — paste it in WhatsApp');
  });
  const draftBtn = $('#draftBtn');
  if (draftBtn) draftBtn.addEventListener('click', () => { $('#replyText').value = r.draftReply; setWa(); draftBtn.remove(); toast('Switched to verified template'); });
  const go = $('#goLeads');
  if (go) go.addEventListener('click', (e) => { e.preventDefault(); showTab('leads'); });
  if (window.innerWidth < 900) $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------- leads ----------------
let leadFilter = { q: '', status: '', intent: '' };
let statuses = ['New', 'Contacted', 'Quoted', 'Won', 'Lost'];

async function refreshLeadCount() {
  try { const d = await api('/api/leads'); $('#leadCount').textContent = d.stats.total || ''; } catch {}
}

function qs(obj) { return new URLSearchParams(Object.entries(obj).filter(([, v]) => v)).toString(); }

async function loadLeads() {
  const d = await api('/api/leads?' + qs(leadFilter));
  statuses = d.statuses;
  $('#leadCount').textContent = d.stats.total || '';
  $('#exportCsv').href = '/api/leads.csv?' + qs(leadFilter);

  const sel = $('#leadStatus');
  if (sel.options.length === 1) statuses.forEach((s) => sel.add(new Option(s, s)));
  const isel = $('#leadIntent');
  if (isel.options.length === 1) Object.entries(INTENT_LABELS).forEach(([k, v]) => isel.add(new Option(v, k)));

  $('#stats').innerHTML = [['', 'All leads', d.stats.total], ...statuses.map((s) => [s, s, d.stats.byStatus[s] || 0])]
    .map(([key, label, n]) => `<button class="stat ${leadFilter.status === key ? 'active' : ''}" data-status="${key}"><div class="stat-num">${n}</div><div class="stat-label">${label}</div></button>`).join('');
  $$('.stat').forEach((b) => b.addEventListener('click', () => { leadFilter.status = b.dataset.status; $('#leadStatus').value = b.dataset.status; loadLeads(); }));

  const list = $('#leadList');
  if (!d.leads.length) {
    list.innerHTML = `<div class="empty-leads card">No leads ${leadFilter.q || leadFilter.status || leadFilter.intent ? 'match this filter' : 'yet — every message you analyse is saved here'}.</div>`;
    return;
  }
  list.innerHTML = d.leads.map(leadCard).join('');
  wireLeadCards();
}

function leadCard(l) {
  const q = l.queries[0];
  const when = new Date(l.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return `
  <div class="lead" data-id="${esc(l.id)}">
    <div class="lead-top">
      <div>
        <div class="lead-who">${esc(l.name || 'Unknown customer')}${l.queries.length > 1 ? `<span class="returning">${l.queries.length} queries</span>` : ''}</div>
        <div class="lead-meta">${esc([l.phone, l.city].filter(Boolean).join(' · ') || 'No phone saved')} · ${esc(when)}</div>
      </div>
      <div class="lead-row">
        <span class="badge badge-sec">${esc(INTENT_LABELS[l.lastIntent] || l.lastIntent)}</span>
        ${q.quoteTotal ? `<span class="badge">${inr(q.quoteTotal)}</span>` : ''}
        <select class="status-select st-${esc(l.status)}" data-field="status">${statuses.map((s) => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="lead-msg">“${esc(q.message)}”</div>
    ${q.products.length ? `<div class="lead-meta">${q.products.map((p) => esc(p.name)).join(' · ')}</div>` : ''}
    <textarea data-field="notes" placeholder="Add a note (saved automatically)…">${esc(l.notes)}</textarea>
    <details>
      <summary>Edit details & history</summary>
      <div class="row3" style="margin:8px 0">
        <input data-field="name" value="${esc(l.name)}" placeholder="Name" />
        <input data-field="phone" value="${esc(l.phone || '')}" placeholder="Phone" />
        <input data-field="city" value="${esc(l.city)}" placeholder="City" />
      </div>
      ${l.queries.map((x) => `<div class="history-item"><div class="lead-meta">${esc(new Date(x.at).toLocaleString('en-IN'))} · ${esc(INTENT_LABELS[x.intent] || x.intent)}</div>
        <div>“${esc(x.message)}”</div><pre>${esc(x.reply)}</pre></div>`).join('')}
      <div class="lead-row" style="margin-top:8px">
        ${l.phone ? `<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/91${esc(l.phone)}">Open WhatsApp</a>` : ''}
        <button class="btn btn-ghost btn-sm" data-action="delete">Delete lead</button>
      </div>
    </details>
  </div>`;
}

function wireLeadCards() {
  $$('.lead').forEach((card) => {
    const id = card.dataset.id;
    const save = async (field, value) => {
      try {
        await api('/api/leads/' + id, { method: 'PATCH', body: { [field]: value } });
        toast('Saved');
        if (field === 'status') loadLeads();
      } catch (e) { toast(e.message); }
    };
    $$('[data-field]', card).forEach((el) => {
      el.addEventListener('change', () => save(el.dataset.field, el.value));
    });
    $('[data-action="delete"]', card).addEventListener('click', async () => {
      if (!confirm('Delete this lead?')) return;
      await api('/api/leads/' + id, { method: 'DELETE' });
      toast('Lead deleted');
      loadLeads();
    });
  });
}

let searchTimer;
$('#leadSearch').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { leadFilter.q = e.target.value.trim(); loadLeads(); }, 250); });
$('#leadStatus').addEventListener('change', (e) => { leadFilter.status = e.target.value; loadLeads(); });
$('#leadIntent').addEventListener('change', (e) => { leadFilter.intent = e.target.value; loadLeads(); });

// ---------------- price list ----------------
let catalog = null;
const CAT_TITLES = { gemstone: '💎 Gemstones (price per ratti)', rudraksha: '📿 Rudraksha', spiritual: '🕉 Malas & Yantras', puja: '🪔 Puja services' };

async function loadPrices() {
  if (!catalog) catalog = await api('/api/catalog');
  const q = $('#priceSearch').value.trim().toLowerCase();
  const products = catalog.products.filter((p) => !q || [p.id, p.name.en, p.name.hi, ...p.aliases].join(' ').toLowerCase().includes(q));
  const groups = {};
  products.forEach((p) => (groups[p.category] = groups[p.category] || []).push(p));
  $('#priceList').innerHTML = Object.keys(CAT_TITLES).filter((c) => groups[c]).map((c) => `
    <h2 class="cat-title">${CAT_TITLES[c]}</h2>
    <div class="price-grid">${groups[c].map((p) => `
      <div class="price-card">
        <div class="pname">${esc(p.name.en)}</div>
        <div class="phi">${esc(p.name.hi)}</div>
        <div class="pid">${esc(p.id)} ${p.inStock ? '· in stock' : '· out of stock'}</div>
        <table>${p.tiers.map((t, i) => `<tr><td>${p.tiers.length === 1 ? 'Price' : `${t.min}${p.tiers[i + 1] ? '–' + (p.tiers[i + 1].min - 1) : '+'} ${p.unit === 'piece' ? 'pcs' : p.unit}`}</td><td class="num"><strong>${inr(t.price)}</strong>/${UNIT[p.unit]}</td></tr>`).join('')}</table>
        ${p.aliases.length ? `<div class="aliases">Also understood as: ${esc(p.aliases.join(', '))}</div>` : ''}
      </div>`).join('')}
    </div>`).join('') || '<p class="muted">No product matches.</p>';
}
$('#priceSearch').addEventListener('input', loadPrices);

// ---------------- start ----------------
refreshLeadCount();
const start = location.hash.replace('#', '');
if (['leads', 'prices'].includes(start)) showTab(start);
