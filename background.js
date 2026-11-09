// Service worker: the only place that talks to translation engines. Content scripts send batches of text;
// results are cached (memory + chrome.storage.local) per engine, so revisiting a page or video is free and instant.
import "./lib/textutil.js";
import "./lib/engines.js";
import "./lib/runtime.js";
import "./lib/embedlogin.js";

const { text: T, engines: E, runtime: R, embedlogin: EL } = globalThis.HTZ;

// keep the embed redirect rule in step with the setting: on every service worker start, and on every change
const syncEmbedLogin = (s) => EL.sync(!!s.embedLogin).catch((e) => console.warn("[HackerTube 中文] embed rule:", e));
R.loadSettings().then(syncEmbedLogin);
R.onSettings(syncEmbedLogin);

const ENGINE_NAMES = { google: "Google 翻译", claude: "Claude", openai: "OpenAI 兼容接口" };
const LIMITS = {
  google: { maxItems: 50, maxChars: 4500, concurrency: 4 },
  llm: { maxItems: 40, maxChars: 6000, concurrency: 3 },
};

// ---------- small helpers ----------
function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
const limits = { google: limiter(LIMITS.google.concurrency), llm: limiter(LIMITS.llm.concurrency) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEM_MAX = 8000;
const mem = new Map();
function memSet(k, v) {
  mem.delete(k);
  mem.set(k, v);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value);
}

// The cache key includes everything that changes the output: engine, model, target language and, for LLMs,
// the kind of text (subtitle prompts differ from page prompts).
function engineId(s, kind, to) {
  if (s.engine === "claude") return `claude|${s.claudeModel}|${kind}|${to}`;
  if (s.engine === "openai") return `openai|${s.openaiBaseUrl}|${s.openaiModel}|${kind}|${to}`;
  return `google|${to}`;
}

// ---------- engines ----------
async function googleBatch(texts, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await limits.google(() => E.google(texts, { to }));
    } catch (e) {
      // the free endpoint rate-limits bursts: back off once, then give up
      if (attempt === 0 && (e.status === 429 || e.status >= 500 || e.name === "TimeoutError")) { await sleep(1500); continue; }
      throw e;
    }
  }
}

async function runChunks(texts, opts, fn) {
  const chunks = T.chunk(texts, opts);
  const parts = await Promise.all(chunks.map((idx) => fn(idx.map((i) => texts[i]))));
  const out = new Array(texts.length);
  chunks.forEach((idx, c) => idx.forEach((i, j) => { out[i] = parts[c][j]; }));
  return out;
}

async function runEngine(texts, { settings, secrets, kind, to, context }) {
  if (settings.engine === "claude" || settings.engine === "openai") {
    const call = settings.engine === "claude"
      ? (batch) => limits.llm(() => E.claude(batch, {
          to, kind, context, model: settings.claudeModel, effort: settings.claudeEffort, apiKey: secrets.claudeKey,
        }))
      : (batch) => limits.llm(() => E.openai(batch, {
          to, kind, context, model: settings.openaiModel, baseUrl: settings.openaiBaseUrl, apiKey: secrets.openaiKey,
        }));
    try {
      return { translations: await runChunks(texts, LIMITS.llm, call), cache: true };
    } catch (e) {
      // keep the page and subtitles working: fall back to Google for this request and say why
      console.warn("[HackerTube 中文] LLM engine failed, falling back to Google:", e);
      const translations = await runChunks(texts, LIMITS.google, (b) => googleBatch(b, to));
      return { translations, cache: false, warning: `${ENGINE_NAMES[settings.engine]} 出错（${e.message}），已临时改用 Google 翻译` };
    }
  }
  return { translations: await runChunks(texts, LIMITS.google, (b) => googleBatch(b, to)), cache: true };
}

async function translate({ texts, kind = "page", to = "zh-CN", context }) {
  if (!Array.isArray(texts) || !texts.length) return { translations: [] };
  if (texts.some((t) => typeof t !== "string")) throw new Error("texts must be strings");
  const [settings, secrets] = await Promise.all([R.loadSettings(), R.loadSecrets()]);
  const eid = engineId(settings, kind, to);
  const keys = texts.map((t) => "c:" + T.hash(eid + "\u0001" + t));
  const out = keys.map((k) => mem.get(k));

  const missingKeys = keys.filter((k, i) => out[i] == null);
  if (missingKeys.length) {
    const stored = await chrome.storage.local.get(missingKeys);
    keys.forEach((k, i) => {
      if (out[i] == null && stored[k] != null) { out[i] = stored[k]; memSet(k, stored[k]); }
    });
  }

  const todo = [];
  out.forEach((v, i) => { if (v == null) todo.push(i); });
  let warning;
  if (todo.length) {
    // dedupe within the request: the same title often appears twice on one page
    const uniq = [...new Set(todo.map((i) => texts[i]))];
    const res = await runEngine(uniq, { settings, secrets, kind, to, context });
    warning = res.warning;
    const byText = new Map(uniq.map((t, j) => [t, res.translations[j]]));
    const toStore = {};
    for (const i of todo) {
      out[i] = byText.get(texts[i]);
      if (res.cache) { memSet(keys[i], out[i]); toStore[keys[i]] = out[i]; }
    }
    if (Object.keys(toStore).length) chrome.storage.local.set(toStore);
  }
  return { translations: out, warning };
}

async function cacheKeys() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith("c:"));
}

async function testEngine() {
  const [settings, secrets] = await Promise.all([R.loadSettings(), R.loadSecrets()]);
  const sample = ["Overwatch Gameplay Architecture and Netcode", "The quick brown fox jumps over the lazy dog."];
  const started = Date.now();
  const res = await runEngine(sample, { settings, secrets, kind: "page", to: "zh-CN" });
  if (res.warning) throw new Error(res.warning);
  return { engine: ENGINE_NAMES[settings.engine], ms: Date.now() - started, sample, translations: res.translations };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const reply = (p) => {
    p.then((data) => sendResponse({ ok: true, ...data }), (e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // async response
  };
  // translation requests come only from our own content scripts and pages
  if (sender.id !== chrome.runtime.id) return false;
  switch (msg && msg.type) {
    case "translate": return reply(translate(msg));
    case "testEngine": return reply(testEngine());
    case "cacheStats": return reply(cacheKeys().then((k) => ({ entries: k.length })));
    case "clearCache": return reply(cacheKeys().then(async (k) => { mem.clear(); await chrome.storage.local.remove(k); return { removed: k.length }; }));
    default: return false;
  }
});
