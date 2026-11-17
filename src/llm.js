// Thin client for an LLM provider. Supports Google Gemini (free tier) and any
// OpenAI-compatible API (OpenAI, Groq, OpenRouter, local Ollama...).
// If no key is configured the app runs in "rules only" mode.

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 20000);

function getConfig() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase()
    || (process.env.GEMINI_API_KEY ? 'gemini' : process.env.GROQ_API_KEY ? 'groq' : process.env.OPENAI_API_KEY ? 'openai' : 'none');

  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    return { provider, model: process.env.GEMINI_MODEL || 'gemini-flash-latest', key: process.env.GEMINI_API_KEY };
  }
  if (provider === 'groq' && process.env.GROQ_API_KEY) {
    return { provider, model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', key: process.env.GROQ_API_KEY, baseUrl: 'https://api.groq.com/openai/v1' };
  }
  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return { provider, model: process.env.OPENAI_MODEL || 'gpt-4o-mini', key: process.env.OPENAI_API_KEY, baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') };
  }
  return { provider: 'none' };
}

function isEnabled() {
  return getConfig().provider !== 'none';
}

async function postJSON(url, headers, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`AI request timed out after ${TIMEOUT_MS} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Returns the model's text output. json=true asks the provider for a JSON-only response. */
async function complete({ system, user, json = false, temperature = 0.2 }) {
  const cfg = getConfig();
  if (cfg.provider === 'none') throw new Error('No AI provider configured');

  if (cfg.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
    const data = await postJSON(url, { 'x-goog-api-key': cfg.key }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
    });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const out = parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
    if (!out) throw new Error('Empty response from Gemini');
    return out;
  }

  const data = await postJSON(`${cfg.baseUrl}/chat/completions`, { Authorization: `Bearer ${cfg.key}` }, {
    model: cfg.model,
    temperature,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  const out = data?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('Empty response from AI');
  return out;
}

// Models sometimes wrap JSON in ```json fences even when asked not to.
function parseJSONLoose(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('AI did not return valid JSON');
}

module.exports = { complete, isEnabled, getConfig, parseJSONLoose };
