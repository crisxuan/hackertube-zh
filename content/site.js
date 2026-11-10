// HackerTube pages: localize the interface instantly, translate titles / summaries / comments as they scroll
// into view, and render the Chinese right under the original (or instead of it). HackerTube is a single-page
// app that re-renders with innerHTML, so everything is driven by a MutationObserver.
(() => {
  const H = globalThis.HTZ;
  const T = H.text, UI = H.uidict, R = H.runtime;

  // Content written per video goes to the translation engine. "block": the translation is a copy of the element
  // (same tag and classes, so it looks native) inserted right after it. "inline": a short label inside a link
  // or chip, translated in place. "dict": try the local UI dictionary first (page headings like "Settings").
  const RULES = [
    { sel: ".vt", kind: "block" },
    { sel: ".watch h1", kind: "block" },
    { sel: ".snip", kind: "block" },
    { sel: ".desc > p", kind: "block" },
    { sel: ".cmt .body > p", kind: "block" },
    { sel: ".plnote", kind: "block" },
    { sel: ".plinfo h2", kind: "block" },
    { sel: ".plinfo .intro", kind: "block" },
    { sel: ".plcard p.sub", kind: "block" },
    { sel: ".pagehead h2", kind: "block", dict: true },
    { sel: ".setting b", kind: "block" },
    { sel: ".setting p", kind: "block" },
    { sel: ".about .lede", kind: "block" },
    { sel: ".about > h2", kind: "block" },
    { sel: ".about > p", kind: "block" },
    { sel: ".about li", kind: "block" },
    { sel: ".areaname", kind: "inline" },
    { sel: ".cats a", kind: "inline" },
    { sel: ".catwrap .chip", kind: "inline" },
    { sel: ".tag.cat", kind: "inline" },
  ];
  const CONTENT_SEL = RULES.map((r) => r.sel).join(",");
  const OURS = ".htz-tr, .htz-inline, .htz-pair, #htz-status, #htz-toast";
  // never touched: our own nodes, code, the copyable agent prompt, hashtags, people's and channels' names
  const SKIP_SEL = `${OURS}, script, style, pre, code, textarea, #agent-prompt, .tag:not(.cat), .chan, .who b, .cmt .meta b, .count, .dur`;

  let settings = { ...R.DEFAULTS };
  let mode = "off";
  const memo = new Map();       // source text -> translation, for this page's lifetime
  const waiting = new Map();    // source text -> elements waiting for it
  const inflight = new Set();   // source texts currently being translated
  let failures = 0;             // requests failed in a row: sets the pause before the next retry
  const replaced = new Map();   // Text node -> original text, so "off" can restore the page exactly
  let handled = new WeakSet();

  // ---------- status pill + toast ----------
  const status = (() => {
    let el, timer;
    return (msg, { error = false, ms = 0 } = {}) => {
      if (!el) { el = document.createElement("div"); el.id = "htz-status"; document.body.append(el); }
      clearTimeout(timer);
      el.textContent = msg || "";
      el.classList.toggle("on", !!msg);
      el.classList.toggle("err", error);
      if (msg && ms) timer = setTimeout(() => el.classList.remove("on"), ms);
    };
  })();
  function toast(msg) {
    let el = document.getElementById("htz-toast");
    if (!el) { el = document.createElement("div"); el.id = "htz-toast"; document.body.append(el); }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("on"), 3000);
  }
  function showProgress() {
    if (inflight.size) status(`翻译中 · ${inflight.size} 条`);
    else status("");
  }

  // ---------- text replacement that can be undone ----------
  function replaceText(node, zh) {
    if (!replaced.has(node)) replaced.set(node, node.data);
    const orig = replaced.get(node);
    const lead = orig.match(/^\s*/)[0], trail = orig.match(/\s*$/)[0];
    node.data = lead + zh + trail;
  }

  function isChannelLine(el) {
    // cards: <h3 class="vt">title</h3><div class="sub">channel</div><div class="sub">views • date</div>
    if (!el.classList.contains("sub") || !el.closest(".vcard, .next")) return false;
    const prev = el.previousElementSibling;
    return !!prev && prev.classList.contains("vt");
  }

  // Interface strings: every text node outside content elements that the dictionary knows.
  function localizeUi(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || !n.data.trim()) return NodeFilter.FILTER_REJECT;
        if (p.closest(SKIP_SEL)) return NodeFilter.FILTER_REJECT;
        // the "▶ this video" / "link" pills inside comments are interface, though they sit in content
        if (p.matches(".mk")) return NodeFilter.FILTER_ACCEPT;
        if (p.closest(CONTENT_SEL) || isChannelLine(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      if (replaced.has(n)) continue;
      const zh = UI.localize(n.data);
      if (zh) replaceText(n, zh);
    }
  }

  // ---------- content translation ----------
  const ruleFor = (el) => RULES.find((r) => el.matches(r.sel));
  const firstText = (el) => [...el.childNodes].find((n) => n.nodeType === 3 && n.data.trim());

  function register(el) {
    if (handled.has(el)) return;
    handled.add(el);
    const rule = ruleFor(el);
    if (!rule) return;
    const node = rule.kind === "inline" ? firstText(el) : null;
    const text = T.normalize(rule.kind === "inline" ? node && node.data : el.textContent);
    if (!text) return;
    if (rule.dict) {
      const zh = UI.localize(text);
      if (zh) { const n = firstText(el); if (n) replaceText(n, zh); return; }
    }
    if (!T.needsTranslation(text) || T.hasCJK(text)) return;
    el.__htz = { rule, node, text };
    if (memo.has(text)) render(el);
    else io.observe(el);
  }

  // Only what is on (or near) the screen gets translated: the home feed scrolls forever.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      enqueue(e.target);
    }
  }, { rootMargin: "800px 0px" });

  function enqueue(el) {
    const { text } = el.__htz;
    if (memo.has(text)) return render(el);
    if (!waiting.has(text)) waiting.set(text, []);
    waiting.get(text).push(el);
    clearTimeout(enqueue.t);
    enqueue.t = setTimeout(flush, 60);
  }

  function flush() {
    const texts = [...waiting.keys()].filter((t) => !inflight.has(t));
    if (!texts.length) return;
    for (const idx of T.chunk(texts, { maxItems: 40, maxChars: 5000 })) send(idx.map((i) => texts[i]));
  }

  async function send(texts) {
    texts.forEach((t) => inflight.add(t));
    showProgress();
    const myMode = mode;
    try {
      const res = await R.translate(texts, { kind: "page" });
      if (mode !== myMode) return;
      failures = 0;
      texts.forEach((t, i) => memo.set(t, res.translations[i]));
      for (const t of texts) for (const el of waiting.get(t) || []) if (el.isConnected) render(el);
      if (res.warning) status(res.warning, { error: true, ms: 6000 });
    } catch (e) {
      status(`翻译失败：${e.message}`, { error: true, ms: 6000 });
      // hand the elements back to the viewport observer after a pause (longer each time, up to 30 s): whatever
      // is still near the screen then is asked for again, so the page recovers once the network or engine does
      const els = texts.flatMap((t) => waiting.get(t) || []);
      setTimeout(() => {
        if (mode === myMode) for (const el of els) if (el.isConnected) io.observe(el);
      }, Math.min(3000 * ++failures, 30000));
    } finally {
      texts.forEach((t) => { inflight.delete(t); waiting.delete(t); });
      if (!document.querySelector("#htz-status.err.on")) showProgress();
    }
  }

  function render(el) {
    if (mode === "off" || !el.__htz) return;
    const { rule, node, text } = el.__htz;
    const zh = memo.get(text);
    if (!zh || T.normalize(zh) === text) return;
    if (rule.kind === "inline") {
      if (!node || !node.isConnected) return;
      if (mode === "zh") return replaceText(node, zh);
      if (node.parentElement && node.parentElement.classList.contains("htz-pair")) return;
      // these labels sit in flex rows (name ... count): wrapping original + translation in one span keeps them
      // a single flex item that flows as text, instead of two squeezed columns
      const pair = document.createElement("span");
      pair.className = "htz-pair";
      const s = document.createElement("span");
      s.className = "htz-inline";
      s.lang = "zh-CN";
      s.textContent = zh;
      node.before(pair);
      pair.append(node, s);
      return;
    }
    if (el.nextElementSibling && el.nextElementSibling.classList.contains("htz-tr")) return;
    // a copy with the same tag and classes picks up the site's own styling (title size, muted colour, clamp)
    const tr = document.createElement(el.tagName === "LI" ? "div" : el.tagName);
    tr.className = `${el.className} htz-tr`.trim();
    tr.lang = "zh-CN";
    tr.textContent = zh;
    el.classList.add("htz-src");
    el.after(tr);
  }

  // ---------- scanning ----------
  function process(root) {
    if (mode === "off" || !(root instanceof Element) || root.closest(OURS)) return;
    const host = root.parentElement && root.parentElement.closest(CONTENT_SEL);
    if (host) return register(host);
    if (root.matches(CONTENT_SEL)) register(root);
    root.querySelectorAll(CONTENT_SEL).forEach(register);
    localizeUi(root);
  }

  const mo = new MutationObserver((muts) => {
    if (mode === "off") return;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) process(n);
        else if (n.nodeType === 3 && n.parentElement) process(n.parentElement);
      }
    }
    if (replaced.size > 3000) for (const n of replaced.keys()) if (!n.isConnected) replaced.delete(n);
  });

  function revertAll() {
    for (const [n, orig] of replaced) if (n.isConnected) n.data = orig;
    replaced.clear();
    document.querySelectorAll(".htz-pair").forEach((p) => p.replaceWith(...[...p.childNodes].filter((n) => n.nodeType === 3)));
    document.querySelectorAll(".htz-tr, .htz-inline").forEach((n) => n.remove());
    document.querySelectorAll(".htz-src").forEach((n) => n.classList.remove("htz-src"));
    io.disconnect();
    waiting.clear();
    handled = new WeakSet();
  }

  function applyMode(next) {
    revertAll();
    mode = next;
    document.documentElement.dataset.htzMode = mode;
    const q = document.getElementById("q");
    if (q) q.placeholder = mode === "off" ? "Search" : settings.searchTranslate ? "搜索（可直接输入中文）" : "搜索";
    if (mode !== "off") process(document.body);
    else status("");
  }

  // ---------- Chinese search: translate the query to English, then let the site search as usual ----------
  // The site's semantic search embeds English text; a Chinese query finds little. We intercept the submit in the
  // capture phase, swap the input's value for the English, and resubmit so the site's own handler runs.
  let bypass = false;
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (bypass || mode === "off" || !settings.searchTranslate || !(form instanceof HTMLFormElement) || form.id !== "search") return;
    const q = form.querySelector("#q");
    const query = q && q.value.trim();
    if (!query || !T.hasCJK(query)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    status("正在把搜索词翻译成英文…");
    try {
      const res = await R.translate([query], { kind: "query", to: "en" });
      const en = T.normalize(res.translations[0]);
      if (en) { q.value = en; toast(`已将「${query}」译为 “${en}” 进行搜索`); }
      status("");
    } catch (err) {
      status(`搜索词翻译失败，按原文搜索：${err.message}`, { error: true, ms: 5000 });
    }
    bypass = true;
    try { form.requestSubmit(); } finally { bypass = false; }
  }, true);

  // ---------- start ----------
  R.loadSettings().then((s) => {
    settings = s;
    applyMode(s.pageMode);
    mo.observe(document.body, { childList: true, subtree: true });
  });
  R.onSettings((s) => {
    const prev = settings;
    settings = s;
    const engineChanged = ["engine", "claudeModel", "openaiBaseUrl", "openaiModel"].some((k) => s[k] !== prev[k]);
    if (engineChanged) memo.clear();
    if (engineChanged || s.pageMode !== prev.pageMode || s.searchTranslate !== prev.searchTranslate) applyMode(s.pageMode);
  });
})();
