// Turn a YouTube caption file (json3 / srv3 XML / WebVTT) into timed sentences that are worth translating
// one at a time. Auto-generated (ASR) captions arrive word by word with no punctuation, manual captions arrive
// as display lines that often cut a sentence in half: both are regrouped so the translator sees whole thoughts.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.HTZ = root.HTZ || {}).subtitles = api;
})(globalThis, function () {
  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
  const clean = (s) => decode(String(s ?? "")).replace(/\s+/g, " ").trim();

  // ---------- parsers: all return { wordLevel, units: [{start, end, text}] } in milliseconds ----------
  function parseJson3(j) {
    const events = (j && j.events) || [];
    const units = [];
    let wordLevel = false;
    for (const ev of events) {
      const segs = ev.segs;
      if (!segs || !segs.length) continue;
      const t0 = ev.tStartMs || 0, end = t0 + (ev.dDurationMs || 0);
      if (segs.some((s) => "tOffsetMs" in s)) {
        // ASR: one seg per word, each with its offset into the event
        wordLevel = true;
        segs.forEach((s, i) => {
          const text = clean(s.utf8);
          if (!text) return;
          const start = t0 + (s.tOffsetMs || 0);
          const nextOff = segs[i + 1] && segs[i + 1].tOffsetMs;
          units.push({ start, end: nextOff != null ? t0 + nextOff : end, text });
        });
      } else {
        const text = clean(segs.map((s) => s.utf8 || "").join(""));
        if (text) units.push({ start: t0, end, text });
      }
    }
    return { wordLevel, units };
  }

  function parseXml(body) {
    const units = [];
    let wordLevel = false;
    // srv3: <p t="ms" d="ms">text or <s t="offset">word</s>...</p>
    const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
    const attr = (a, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(a); return m ? m[1] : null; };
    let m;
    while ((m = pRe.exec(body))) {
      const t0 = +attr(m[1], "t") || 0, end = t0 + (+attr(m[1], "d") || 0);
      const inner = m[2];
      const words = [...inner.matchAll(/<s\b([^>]*)>([\s\S]*?)<\/s>/g)];
      if (words.length) {
        wordLevel = true;
        words.forEach((w, i) => {
          const text = clean(w[2].replace(/<[^>]+>/g, ""));
          if (!text) return;
          const off = +attr(w[1], "t") || 0;
          const next = words[i + 1] && attr(words[i + 1][1], "t");
          units.push({ start: t0 + off, end: next != null ? t0 + +next : end, text });
        });
      } else {
        const text = clean(inner.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, ""));
        if (text) units.push({ start: t0, end, text });
      }
    }
    if (units.length) return { wordLevel, units };
    // legacy format: <text start="1.2" dur="3.4">...</text>, in seconds
    const tRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    while ((m = tRe.exec(body))) {
      const start = Math.round((+attr(m[1], "start") || 0) * 1000);
      const text = clean(m[2].replace(/<[^>]+>/g, ""));
      if (text) units.push({ start, end: start + Math.round((+attr(m[1], "dur") || 0) * 1000), text });
    }
    return { wordLevel: false, units };
  }

  function vttTime(s) {
    const p = s.trim().split(":").map(Number);
    const sec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    return Math.round(sec * 1000);
  }
  function parseVtt(body) {
    const units = [];
    for (const block of body.replace(/\r/g, "").split(/\n\n+/)) {
      const lines = block.split("\n");
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) continue;
      const [a, b] = lines[i].split("-->");
      const text = clean(lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, ""));
      if (text) units.push({ start: vttTime(a), end: vttTime(b.trim().split(/\s+/)[0]), text });
    }
    // rolling auto-captions repeat the previous line: drop exact repeats
    const deduped = units.filter((u, i) => i === 0 || u.text !== units[i - 1].text);
    return { wordLevel: false, units: deduped };
  }

  function parseTimedText(body) {
    const s = String(body || "").trim();
    if (!s) return null;
    try {
      if (s[0] === "{") return parseJson3(JSON.parse(s));
      if (s.startsWith("WEBVTT")) return parseVtt(s);
      if (s[0] === "<") return parseXml(s);
    } catch (e) { return null; }
    return null;
  }

  // ---------- sentence building ----------
  const ABBREV = /\b(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|approx|no|fig)\.$/i;
  const endsSentence = (t) => /[.!?…。！？]["'”’)\]]*$/.test(t) && !ABBREV.test(t);
  const joinWords = (words) => words.map((w) => w.text).join(" ").replace(/\s+([,.!?;:%])/g, "$1");

  function fromWords(words) {
    const out = [];
    let cur = [], chars = 0;
    const flush = () => {
      if (!cur.length) return;
      out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: joinWords(cur) });
      cur = []; chars = 0;
    };
    for (const w of words) {
      if (cur.length) {
        const gap = w.start - cur[cur.length - 1].end;
        const n = cur.length;
        // break at pauses, preferring longer pauses for short fragments so a line isn't one or two words
        if (gap > 1500 || (n >= 8 && gap > 500) || (n >= 14 && gap > 250) || n >= 24 || chars >= 140) flush();
      }
      cur.push(w); chars += w.text.length + 1;
      if (cur.length >= 3 && endsSentence(w.text)) flush();
    }
    flush();
    return out;
  }

  // Split a display line at sentence boundaries, giving each piece a share of the line's time by length.
  function splitCue(c) {
    const parts = c.text.split(/(?<=[.!?…]["'”’)\]]?)\s+(?=["'“‘(\[]?[A-Z0-9])/).filter(Boolean);
    if (parts.length < 2) return [c];
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let t = c.start;
    return parts.map((p) => {
      const d = Math.round(((c.end - c.start) * p.length) / total);
      const piece = { start: t, end: t + d, text: p };
      t += d;
      return piece;
    });
  }

  function fromCues(cues) {
    const punctuated = cues.filter((c) => /[.!?…。！？]/.test(c.text)).length / (cues.length || 1) >= 0.15;
    const pieces = punctuated ? cues.flatMap(splitCue) : cues;
    const out = [];
    let cur = null;
    const flush = () => { if (cur) out.push(cur); cur = null; };
    for (const p of pieces) {
      if (cur) {
        const gap = p.start - cur.end;
        const tooLong = cur.end - cur.start > 12000 || cur.text.length > 200;
        // without punctuation we can't find sentence ends: keep the uploader's lines, only gluing tiny ones on
        if (gap > 1500 || tooLong || (!punctuated && cur.text.length >= 15)) flush();
      }
      if (!cur) cur = { start: p.start, end: p.end, text: p.text };
      else { cur.end = Math.max(cur.end, p.end); cur.text += " " + p.text; }
      if (punctuated && endsSentence(cur.text)) flush();
    }
    flush();
    return out;
  }

  // Lines stay up until the next one starts when the gap is short, so subtitles don't flicker off mid-phrase.
  function settleTimes(list) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length; i++) {
      const s = list[i], next = list[i + 1];
      s.end = Math.max(s.end, s.start + 1000);
      if (next) {
        if (next.start - s.end < 1500) s.end = next.start;
        if (s.end > next.start) s.end = Math.max(next.start, s.start + 200);
      }
    }
    return list;
  }

  function buildSentences(parsed) {
    if (!parsed || !parsed.units.length) return [];
    const list = parsed.wordLevel ? fromWords(parsed.units) : fromCues(parsed.units);
    return settleTimes(list.filter((s) => s.text));
  }

  // Index of the sentence showing at time `ms`, or -1. `list` is sorted by start.
  function findActive(list, ms) {
    let lo = 0, hi = list.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].start <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 && ms < list[ans].end ? ans : -1;
  }

  // First sentence that ends after `ms` (the one showing now or the next one up).
  function firstFrom(list, ms) {
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].end <= ms) lo = mid + 1; else hi = mid; }
    return lo;
  }

  return { parseTimedText, buildSentences, findActive, firstFrom, endsSentence };
});
