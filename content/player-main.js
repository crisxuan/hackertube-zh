// Runs in the page's own JavaScript world inside the YouTube embed that HackerTube shows (youtube-nocookie.com).
// YouTube's caption requests are signed by the player (a proof-of-origin token), so instead of fetching captions
// ourselves we turn captions on through the player's API and copy the caption file the player downloads.
// Everything found is handed to the extension's isolated script (player.js) with window.postMessage.
(() => {
  if (window.__htzMain) return;
  window.__htzMain = true;

  // only inside HackerTube's embeds; YouTube embeds on other sites are left completely alone
  const anc = location.ancestorOrigins;
  const origins = anc ? Array.from({ length: anc.length }, (_, i) => anc[i]) : [document.referrer];
  const fromHackerTube = origins.some((o) => { try { return /(^|\.)hackertube\.org$/.test(new URL(o).hostname); } catch { return false; } });
  if (!fromHackerTube) return;

  const post = (type, data = {}) => window.postMessage({ source: "htz-main", type, ...data }, "*");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isTimedText = (u) => /\/api\/timedtext\b/.test(u);

  let lastVid = null, lastTitle = "", gotFor = null;

  function onTimedText(url, body) {
    if (!body || body.length < 20) return;
    let u;
    try { u = new URL(url, location.href); } catch { return; }
    // a tlang= request is YouTube's own machine translation of a track: we translate the source track ourselves
    if (u.searchParams.get("tlang")) return;
    const vid = u.searchParams.get("v") || lastVid;
    gotFor = vid;
    post("captions", { vid, title: lastTitle, lang: u.searchParams.get("lang") || "", kind: u.searchParams.get("kind") || "", body });
  }

  // ---------- copy caption downloads (fetch and XHR) ----------
  const origFetch = window.fetch;
  window.fetch = function (input) {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const p = origFetch.apply(this, arguments);
    if (isTimedText(url)) p.then((r) => r.clone().text()).then((body) => onTimedText(url, body)).catch(() => {});
    return p;
  };
  const xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__htzUrl = String(url);
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__htzUrl && isTimedText(this.__htzUrl)) {
      this.addEventListener("load", () => {
        try {
          const rt = this.responseType;
          const body = rt === "" || rt === "text" ? this.responseText
            : rt === "json" ? JSON.stringify(this.response)
            : rt === "arraybuffer" ? new TextDecoder().decode(this.response) : "";
          onTimedText(this.__htzUrl, body);
        } catch {}
      });
    }
    return xhrSend.apply(this, arguments);
  };

  // ---------- turn captions on once the video plays ----------
  const player = () => document.getElementById("movie_player");
  const isEnglish = (t) => /^en\b/i.test(t.languageCode || "");
  const isAsr = (t) => t.kind === "asr" || /^a\./.test(t.vss_id || t.vssId || "");
  const choose = (list) => list.find((t) => isEnglish(t) && !isAsr(t)) || list.find(isEnglish)
    || list.find((t) => !isAsr(t)) || list[0];

  function responseTracks(p) {
    try {
      const r = p.getPlayerResponse && p.getPlayerResponse();
      return (r && r.captions && r.captions.playerCaptionsTracklistRenderer
        && r.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
    } catch { return []; }
  }

  async function enableCaptions(p, vid) {
    if (gotFor === vid) return; // the player already loaded captions (user had CC on)
    try { p.loadModule("captions"); } catch {}
    let list = [];
    for (let i = 0; i < 12 && !list.length; i++) {
      try { list = p.getOption("captions", "tracklist", { includeAsr: true }) || []; } catch {}
      if (!list.length) await sleep(300);
    }
    // subtitles were switched off while we waited: leave the player alone, and try again if they come back on
    if (!wanted) { triedFor = null; return; }
    const tracks = responseTracks(p);
    if (!list.length && !tracks.length) return post("nocaptions", { vid });
    if (list.length) { try { p.setOption("captions", "track", choose(list)); turnedOnFor = vid; } catch {} }
    await sleep(3500);
    if (gotFor === vid) return;
    if (!wanted) { triedFor = null; return; }
    // second route: the track's own URL (works for videos whose captions aren't token-gated)
    const t = tracks.length && choose(tracks);
    if (t && t.baseUrl) {
      try {
        const url = t.baseUrl + (t.baseUrl.includes("fmt=") ? "" : "&fmt=json3");
        const body = await (await origFetch(url, { credentials: "include" })).text();
        onTimedText(url, body);
      } catch {}
    }
    await sleep(3000);
    if (gotFor !== vid) post("captionsfailed", { vid });
  }

  // Our subtitles going off also turns off the YouTube captions we switched on to get the caption file, or they
  // would show in their place. Captions the viewer turned on themselves are theirs and stay.
  function restoreCaptions() {
    const p = player();
    if (!p || turnedOnFor === null || turnedOnFor !== lastVid) return;
    turnedOnFor = null;
    try { p.setOption("captions", "track", {}); } catch {}
  }

  let wanted = false, triedFor = null, turnedOnFor = null;
  setInterval(() => {
    const p = player();
    if (!p || !p.getVideoData) return;
    let vd = {};
    try { vd = p.getVideoData() || {}; } catch {}
    const vid = vd.video_id;
    if (!vid) return;
    if (vid !== lastVid) { lastVid = vid; lastTitle = vd.title || ""; post("video", { vid, title: lastTitle }); }
    else if (!lastTitle && vd.title) { lastTitle = vd.title; post("video", { vid, title: lastTitle }); }
    let state = -1;
    try { state = p.getPlayerState(); } catch {}
    if (wanted && triedFor !== vid && state === 1) { triedFor = vid; enableCaptions(p, vid); }
  }, 700);

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "htz-iso") return;
    if (e.data.type !== "config") return;
    const was = wanted;
    wanted = !!e.data.enabled;
    if (was && !wanted) restoreCaptions();
  });
  post("hello");
})();
