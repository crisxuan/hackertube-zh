const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../lib/cache.js");

// chrome.storage.local as the cache uses it; `reads` records every get() so tests can see what was loaded
function fakeStorage(initial = {}, { getKeys = true } = {}) {
  const data = { ...initial };
  const reads = [];
  const s = {
    data, reads,
    async get(keys) {
      reads.push(keys);
      if (keys == null) return { ...data };
      const out = {};
      for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
      return out;
    },
    async set(obj) { Object.assign(data, obj); },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
  };
  if (getKeys) s.getKeys = async () => Object.keys(data);
  return s;
}
const entryKeys = (s) => Object.keys(s.data).filter((k) => /^c\d*:/.test(k)).sort();

test("what was put is returned, also by a new instance (a restarted service worker)", async () => {
  const s = fakeStorage();
  await C.create(s).put({ a: "甲", b: "乙" });
  assert.deepEqual(await C.create(s).get(["b", "missing", "a"]), ["乙", undefined, "甲"]);
});

test("a full generation starts a new one, and the generation before the previous one is deleted", async () => {
  const s = fakeStorage();
  const c = C.create(s, { genMax: 2, memMax: 0 });
  await c.put({ a: "1", b: "2" }); // generation 1 is full: generation 2 starts
  await c.put({ c: "3" });
  assert.deepEqual(entryKeys(s), ["c1:a", "c1:b", "c2:c"]);
  assert.deepEqual(await C.create(s, { memMax: 0 }).get(["missing"]), [undefined]); // reading changes nothing
  await c.put({ d: "4" });         // generation 2 is full: generation 3 starts, generation 1 goes
  assert.deepEqual(entryKeys(s), ["c2:c", "c2:d"]);
  assert.deepEqual(await c.get(["a", "c"]), [undefined, "3"]);
});

test("an entry read from the previous generation is copied forward and survives the next rotation", async () => {
  const s = fakeStorage();
  const c = C.create(s, { genMax: 3, memMax: 0 });
  await c.put({ a: "1", b: "2", c: "3" });      // generation 1 is full, generation 2 starts
  assert.deepEqual(await c.get(["a"]), ["1"]);  // still in use: copied into generation 2
  await c.put({ d: "4", e: "5" });              // generation 2 is full, generation 1 is deleted
  assert.deepEqual(await c.get(["a", "b"]), ["1", undefined]);
});

test("entries saved before generations existed are still read, and go at the first rotation", async () => {
  const s = fakeStorage({ "c:old": "旧" });
  const c = C.create(s, { genMax: 2, memMax: 0 });
  assert.deepEqual(await c.get(["old", "x"]), ["旧", undefined]);
  await c.put({ y: "新" });
  assert.equal(s.data["c:old"], undefined);
  assert.deepEqual(await c.get(["old"]), ["旧"]); // it was copied forward when read
});

test("rotation and clear leave everything that is not a cached translation alone", async () => {
  const s = fakeStorage({ secrets: { claudeKey: "k" }, "config:x": 1 });
  const c = C.create(s, { genMax: 1 });
  await c.put({ a: "1" });
  await c.put({ b: "2" }); // two rotations so far: only b is left
  assert.deepEqual(entryKeys(s), ["c2:b"]);
  assert.equal(await c.clear(), 1);
  assert.deepEqual(entryKeys(s), []);
  assert.deepEqual(s.data.secrets, { claudeKey: "k" });
  assert.equal(s.data["config:x"], 1);
  assert.deepEqual(await c.get(["a", "b"]), [undefined, undefined]);
});

test("count lists keys without reading the values, and counts a copied-forward entry once", async () => {
  const s = fakeStorage({ "c1:a": "1", "c2:a": "1", "c2:b": "2", cacheMeta: { gen: 2, count: 2 }, secrets: {} });
  assert.equal(await C.create(s).count(), 2);
  assert.deepEqual(s.reads, []);
});

test("without getKeys (Chrome before 130) count falls back to reading storage", async () => {
  const s = fakeStorage({ "c1:a": "1", "c:b": "2", secrets: {} }, { getKeys: false });
  assert.equal(await C.create(s).count(), 2);
});
