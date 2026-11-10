// Translation cache: a small in-memory copy in front of chrome.storage.local.
// Storage is capped by generations. New entries go to the current generation; when it has taken genMax entries a
// new one starts and everything older than the previous generation is deleted. An entry found in the previous
// generation is copied to the current one, so translations that are still in use survive the rotation.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.HTZ = root.HTZ || {}).cache = api;
})(globalThis, function () {
  const META = "cacheMeta";
  const ENTRY = /^c\d*:/;
  // entries saved before generations existed are keyed "c:<id>": they are read as generation 0
  const prefix = (gen) => (gen > 0 ? `c${gen}:` : "c:");
  // an entry copied forward exists in two generations but is one translation
  const distinct = (keys) => new Set(keys.map((k) => k.slice(k.indexOf(":") + 1))).size;

  function create(storage, { genMax = 20000, memMax = 8000 } = {}) {
    const mem = new Map();
    let meta; // { gen, count }: the current generation and how many entries were written to it

    function remember(id, value) {
      mem.delete(id);
      mem.set(id, value);
      if (mem.size > memMax) mem.delete(mem.keys().next().value);
    }

    let loading;
    const load = () => loading
      || (loading = storage.get(META).then((got) => { meta = got[META] || { gen: 1, count: 0 }; }));

    async function entryKeys() {
      // getKeys (Chrome 130+) lists the keys without reading every cached translation into memory
      const keys = storage.getKeys ? await storage.getKeys() : Object.keys(await storage.get(null));
      return keys.filter((k) => ENTRY.test(k));
    }

    async function rotate() {
      const gen = meta.gen + 1;
      meta = { gen, count: 0 };
      await storage.set({ [META]: meta });
      const keep = [prefix(gen), prefix(gen - 1)];
      const stale = (await entryKeys()).filter((k) => !keep.some((p) => k.startsWith(p)));
      if (stale.length) await storage.remove(stale);
    }

    // entries: { id: translation }
    async function put(entries) {
      const ids = Object.keys(entries);
      if (!ids.length) return;
      await load();
      const items = {};
      for (const id of ids) { remember(id, entries[id]); items[prefix(meta.gen) + id] = entries[id]; }
      meta = { gen: meta.gen, count: meta.count + ids.length };
      items[META] = meta;
      await storage.set(items);
      if (meta.count >= genMax) await rotate();
    }

    // the cached translation for each id, in order; undefined where there is none
    async function get(ids) {
      const out = ids.map((id) => mem.get(id));
      const missing = ids.filter((id, i) => out[i] === undefined);
      if (!missing.length) return out;
      await load();
      const cur = prefix(meta.gen), old = prefix(meta.gen - 1);
      const stored = await storage.get(missing.flatMap((id) => [cur + id, old + id]));
      const carry = {};
      ids.forEach((id, i) => {
        if (out[i] !== undefined) return;
        if (stored[cur + id] != null) out[i] = stored[cur + id];
        else if (stored[old + id] != null) out[i] = carry[id] = stored[old + id];
        else return;
        remember(id, out[i]);
      });
      await put(carry);
      return out;
    }

    async function count() {
      return distinct(await entryKeys());
    }

    // removes every cached translation and nothing else; resolves to how many there were
    async function clear() {
      await load();
      mem.clear();
      const keys = await entryKeys();
      if (keys.length) await storage.remove(keys);
      meta = { gen: meta.gen, count: 0 };
      await storage.set({ [META]: meta });
      return distinct(keys);
    }

    return { get, put, count, clear };
  }

  return { create };
});
