// A minimal in-page stand-in for the extension APIs the scripts use (runtime messaging, storage), so the real
// background.js and content scripts can run together on a normal web page during development.
(() => {
  const handlers = [];
  const changeListeners = [];
  const data = { sync: {}, local: {} };
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  function area(name) {
    const d = data[name];
    return {
      async get(keys) {
        if (keys == null) return clone(d);
        const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out = {};
        for (const k of list) if (k in d) out[k] = clone(d[k]);
        return out;
      },
      async set(obj) {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: d[k], newValue: clone(v) }; d[k] = clone(v); }
        changeListeners.forEach((fn) => fn(changes, name));
      },
      async remove(keys) { for (const k of [].concat(keys)) delete d[k]; },
    };
  }

  window.chrome = {
    runtime: {
      id: "htz-dev",
      lastError: undefined,
      onMessage: { addListener: (fn) => handlers.push(fn) },
      sendMessage(msg, cb) {
        let done = false;
        const respond = (r) => { if (!done) { done = true; setTimeout(() => cb && cb(r)); } };
        for (const fn of handlers) if (fn(msg, { id: "htz-dev" }, respond) === true) return;
        respond(undefined);
      },
      openOptionsPage() {},
    },
    storage: { sync: area("sync"), local: area("local"), onChanged: { addListener: (fn) => changeListeners.push(fn) } },
    permissions: { request: async () => true },
    // records the dynamic rules the service worker would install, so they can be inspected from the console
    declarativeNetRequest: {
      async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
        dynamicRules = dynamicRules.filter((r) => !removeRuleIds.includes(r.id)).concat(clone(addRules));
      },
      async getDynamicRules() { return clone(dynamicRules); },
    },
  };
  let dynamicRules = [];
  window.__htzDev = { data, setSettings: (patch) => chrome.storage.sync.get("settings").then(({ settings }) => chrome.storage.sync.set({ settings: { ...settings, ...patch } })) };
})();
