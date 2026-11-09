// Small text helpers shared by the service worker, content scripts and the node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.HTZ = root.HTZ || {}).text = api;
})(globalThis, function () {
  const CJK = /[㐀-鿿豈-﫿]/;
  const LATIN_WORD = /[A-Za-z]{2,}/;

  const hasCJK = (s) => CJK.test(s || "");
  // Worth sending to a translator: has at least one real word in a Latin-script language.
  const needsTranslation = (s) => LATIN_WORD.test(s || "");
  const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  // Two FNV-1a passes with different offsets: a short, stable cache key without crypto.subtle (sync, works in node).
  function hash(s) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
  }

  // Split indices of `texts` into batches that respect both an item cap and a character budget.
  function chunk(texts, { maxItems = 50, maxChars = 4000 } = {}) {
    const out = [];
    let cur = [], chars = 0;
    texts.forEach((t, i) => {
      const len = t.length;
      if (cur.length && (cur.length >= maxItems || chars + len > maxChars)) { out.push(cur); cur = []; chars = 0; }
      cur.push(i); chars += len;
    });
    if (cur.length) out.push(cur);
    return out;
  }

  return { hasCJK, needsTranslation, normalize, hash, chunk };
});
