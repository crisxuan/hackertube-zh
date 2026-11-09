// Isolated content script inside HackerTube's YouTube embed: receives the caption file from player-main.js,
// regroups it into sentences, translates them a few minutes ahead of playback and draws the Chinese subtitles
// over the video (inside the player element, so they also show in fullscreen).
(() => {
  const H = globalThis.HTZ;
  const S = H.subtitles, R = H.runtime;

  const anc = location.ancestorOrigins;
  const origins = anc ? Array.from({ length: anc.length }, (_, i) => anc[i]) : [document.referrer];
  const fromHackerTube = origins.some((o) => { try { return /(^|\.)hackertube\.org$/.test(new URL(o).hostname); } catch { return false; } });
  // HTZ_ALLOW_ANY_HOST is only ever set by the local test harness (dev/), which loads this file as a page script
  if (!fromHackerTube && !globalThis.HTZ_ALLOW_ANY_HOST) return;

  const LOOKAHEAD_MS = 5 * 60 * 1000; // translate up to five minutes ahead: cost follows what is actually watched
  const MAX_INFLIGHT = 2;

  let settings = { ...R.DEFAULTS };
  let vid = null, title = "";
  let sentences = [], zh = [], st = []; // st: 0 = not sent, 1 = in flight, 2 = done, 3 = gave up
  let gen = 0, inflight = 0, failures = 0, doneCount = 0;

  const post = (type, data = {}) => window.postMessage({ source: "htz-iso", type, ...data }, "*");
  const sendConfig = () => post("config", { enabled: settings.subMode !== "off" });
  const player = () => document.getElementById("movie_player");
  const video = () => document.querySelector("#movie_player video") || document.querySelector("video");

  // ---------- overlay ----------
  let overlay, zhLine, enLine, badge, badgeTimer, shown = "";
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) e.target.style.setProperty("--htz-h", `${Math.round(e.contentRect.height)}px`);
  });

  function ensureOverlay() {
    const p = player();
    if (!p) return false;
    if (overlay && overlay.isConnected && overlay.parentElement === p) return true;
    overlay = document.createElement("div");
    overlay.className = "htz-sub";
    overlay.setAttribute("aria-hidden", "true");
    zhLine = document.createElement("div"); zhLine.className = "htz-line htz-zh"; zhLine.lang = "zh-CN";
    enLine = document.createElement("div"); enLine.className = "htz-line htz-en";
    overlay.append(zhLine, enLine);
    badge = document.createElement("div"); badge.className = "htz-badge";
    p.append(overlay, badge);
    ro.observe(p);
    applyStyle();
    return true;
  }

  function applyStyle() {
    const p = player();
    if (!p) return;
    p.style.setProperty("--htz-scale", String(settings.subScale || 1));
    p.style.setProperty("--htz-bottom", String(settings.subBottom ?? 8));
    // our lines include the English, so YouTube's own captions would only duplicate them
    p.classList.toggle("htz-hide-native", settings.subMode !== "off" && sentences.length > 0);
  }

  function say(msg, { ms = 4000, error = false } = {}) {
    if (!ensureOverlay()) return;
    clearTimeout(badgeTimer);
    badge.textContent = msg;
    badge.classList.toggle("err", error);
    badge.classList.add("on");
    if (ms) badgeTimer = setTimeout(() => badge.classList.remove("on"), ms);
  }

  function render() {
    if (!overlay || !overlay.isConnected) { if (!sentences.length || !ensureOverlay()) return; }
    const v = video();
    const i = v && sentences.length && settings.subMode !== "off" ? S.findActive(sentences, v.currentTime * 1000) : -1;
    let z = "", e = "";
    if (i >= 0) {
      const en = sentences[i].text, tr = zh[i];
      if (settings.subMode === "zh") z = tr || en;
      else { z = tr || ""; e = en; }
    }
    const key = `${z}\u0001${e}`;
    if (key === shown) return;
    shown = key;
    zhLine.textContent = z;
    enLine.textContent = e;
    overlay.classList.toggle("on", !!(z || e));
  }

  let raf = 0;
  function loop() {
    raf = 0;
    render();
    const v = video();
    if (v && !v.paused) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  // ---------- translation scheduling ----------
  function progress() {
    if (!sentences.length) return;
    const total = sentences.length;
    if (doneCount < total && inflight) say(`中文字幕 · 翻译中 ${doneCount}/${total}`, { ms: 0 });
    else if (badge && badge.textContent.startsWith("中文字幕 · 翻译中")) say(`中文字幕 · 已就绪 ${doneCount}/${total}`, { ms: 1500 });
  }

  function pump() {
    if (settings.subMode === "off" || !sentences.length) return;
    const v = video();
    const now = v ? v.currentTime * 1000 : 0;
    while (inflight < MAX_INFLIGHT) {
      let i = S.firstFrom(sentences, now - 2000);
      while (i < sentences.length && st[i] !== 0) i++;
      if (i >= sentences.length || sentences[i].start > now + LOOKAHEAD_MS) break;
      // first request is small so the first subtitle appears within a second or two
      const size = doneCount === 0 && inflight === 0 ? 6 : 25;
      const idx = [];
      for (let j = i; j < sentences.length && idx.length < size && st[j] === 0; j++) idx.push(j);
      idx.forEach((k) => { st[k] = 1; });
      inflight++;
      const myGen = gen;
      const previous = sentences.slice(Math.max(0, i - 3), i).map((s) => s.text);
      R.translate(idx.map((k) => sentences[k].text), { kind: "subtitle", context: { title, previous } })
        .then((res) => {
          if (myGen !== gen) return;
          failures = 0;
          idx.forEach((k, n) => { zh[k] = res.translations[n]; st[k] = 2; });
          doneCount += idx.length;
          if (res.warning) say(res.warning, { error: true, ms: 6000 });
        })
        .catch((err) => {
          if (myGen !== gen) return;
          failures++;
          const giveUp = failures >= 3;
          idx.forEach((k) => { st[k] = giveUp ? 3 : 0; });
          say(`字幕翻译失败：${err.message}`, { error: true, ms: 6000 });
          if (!giveUp) setTimeout(pump, 2500 * failures);
        })
        .finally(() => {
          if (myGen !== gen) return;
          inflight--;
          shown = "";
          render();
          progress();
          if (failures < 3) pump();
        });
    }
    progress();
  }

  function reset(newVid) {
    gen++;
    vid = newVid;
    sentences = []; zh = []; st = [];
    inflight = 0; failures = 0; doneCount = 0; shown = "";
    if (overlay) { zhLine.textContent = ""; enLine.textContent = ""; overlay.classList.remove("on"); }
    applyStyle();
  }

  function onCaptions(msg) {
    if (msg.vid && msg.vid !== vid) reset(msg.vid);
    if (msg.title) title = msg.title;
    const list = S.buildSentences(S.parseTimedText(msg.body));
    if (!list.length) return;
    // a second copy of the same track (YouTube re-requests on seek or quality change) changes nothing
    if (sentences.length === list.length && sentences.every((s, i) => s.text === list[i].text)) return;
    reset(vid);
    sentences = list;
    zh = new Array(list.length);
    st = new Array(list.length).fill(0);
    ensureOverlay();
    applyStyle();
    if (settings.subMode !== "off") say(`中文字幕 · 已获取 ${list.length} 句${msg.kind === "asr" ? "（自动生成字幕）" : ""}`, { ms: 0 });
    pump();
    kick();
  }

  // ---------- wiring ----------
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "htz-main") return;
    const m = e.data;
    if (m.type === "hello") sendConfig();
    else if (m.type === "video") { if (m.vid !== vid) reset(m.vid); title = m.title || title; }
    else if (m.type === "captions" && typeof m.body === "string") onCaptions(m);
    else if (m.type === "nocaptions" && m.vid === vid && settings.subMode !== "off") say("这个视频没有字幕，无法生成中文字幕", { ms: 6000 });
    else if (m.type === "captionsfailed" && m.vid === vid && !sentences.length && settings.subMode !== "off") {
      say("没拿到字幕：点一下播放器右下角的 CC 按钮即可重试", { ms: 8000 });
    }
  });

  // media events don't bubble, but a capturing listener on the document still sees them
  let lastPump = 0;
  document.addEventListener("play", kick, true);
  document.addEventListener("seeked", () => { shown = ""; render(); pump(); }, true);
  document.addEventListener("pause", render, true);
  document.addEventListener("timeupdate", () => {
    render();
    if (Date.now() - lastPump > 3000) { lastPump = Date.now(); pump(); }
  }, true);

  R.loadSettings().then((s) => { settings = s; sendConfig(); applyStyle(); });
  R.onSettings((s) => {
    const prev = settings;
    settings = s;
    sendConfig();
    applyStyle();
    const engineChanged = ["engine", "claudeModel", "openaiBaseUrl", "openaiModel"].some((k) => s[k] !== prev[k]);
    if (engineChanged && sentences.length) {
      const keep = sentences;
      reset(vid);
      sentences = keep;
      zh = new Array(keep.length);
      st = new Array(keep.length).fill(0);
    }
    shown = "";
    render();
    pump();
  });
})();
