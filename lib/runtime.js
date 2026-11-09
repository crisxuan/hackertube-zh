// Settings and messaging shared by the service worker, content scripts, popup and options page.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.HTZ = root.HTZ || {}).runtime = api;
})(globalThis, function () {
  const DEFAULTS = {
    pageMode: "bilingual",        // bilingual | zh | off — HackerTube pages
    subMode: "bilingual",         // bilingual | zh | off — subtitles on the embedded player
    engine: "google",             // google | claude | openai
    searchTranslate: true,        // Chinese search queries are translated to English before searching
    embedLogin: false,            // play HackerTube's embeds via youtube.com/embed so the user's YouTube login applies
    subScale: 1,                  // subtitle size multiplier
    subBottom: 8,                 // subtitle distance from the bottom of the video, in %
    subStyle: "outline",          // outline (text with a dark outline, no box) | box (translucent box)
    claudeModel: "claude-opus-5-5",
    claudeEffort: "low",          // translation is a simple task: low effort keeps latency and thinking spend down
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiModel: "",
  };

  // API keys live in storage.local only, so they are never synced to the user's Google account.
  async function loadSettings() {
    const { settings } = await chrome.storage.sync.get("settings");
    return { ...DEFAULTS, ...(settings || {}) };
  }
  async function saveSettings(patch) {
    const next = { ...(await loadSettings()), ...patch };
    await chrome.storage.sync.set({ settings: next });
    return next;
  }
  function onSettings(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) cb({ ...DEFAULTS, ...(changes.settings.newValue || {}) });
    });
  }
  async function loadSecrets() {
    const { secrets } = await chrome.storage.local.get("secrets");
    return secrets || {};
  }
  async function saveSecrets(patch) {
    const next = { ...(await loadSecrets()), ...patch };
    await chrome.storage.local.set({ secrets: next });
    return next;
  }

  // Content script -> service worker. Resolves to { translations, warning? }.
  function translate(texts, { kind = "page", to = "zh-CN", context } = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "translate", texts, kind, to, context }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          if (!res || !res.ok) return reject(new Error((res && res.error) || "no response"));
          resolve(res);
        });
      } catch (e) {
        // the extension was reloaded or updated while this page stayed open
        reject(new Error("扩展已更新，请刷新页面"));
      }
    });
  }

  return { DEFAULTS, loadSettings, saveSettings, onSettings, loadSecrets, saveSecrets, translate };
});
