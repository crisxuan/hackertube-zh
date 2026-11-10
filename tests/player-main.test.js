const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../content/player-main.js"), "utf8");

// Timers the test moves by hand; promise callbacks settle after every timer that fires.
function fakeClock() {
  let now = 0, seq = 0;
  const timers = [];
  const add = (fn, ms, every) => { timers.push({ at: now + ms, fn, every, id: ++seq }); return seq; };
  return {
    setTimeout: (fn, ms = 0) => add(fn, ms),
    setInterval: (fn, ms) => add(fn, ms, ms),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const t = timers[0];
        if (!t || t.at > end) break;
        now = t.at;
        if (t.every) t.at += t.every; else timers.shift();
        t.fn();
        await new Promise(setImmediate);
      }
      now = end;
    },
  };
}

// Runs player-main.js in a stand-in for a YouTube embed inside HackerTube, with a playing video "vid1".
function embed({ tracks = [{ languageCode: "en" }] } = {}) {
  const clock = fakeClock();
  const setOption = []; // every player.setOption(...) call
  const posted = [];    // message types sent to the isolated script
  const player = {
    tracks,
    getVideoData: () => ({ video_id: "vid1", title: "A talk" }),
    getPlayerState: () => 1,
    loadModule() {},
    getOption: () => player.tracks,
    setOption: (...args) => setOption.push(JSON.parse(JSON.stringify(args))),
    getPlayerResponse: () => ({}),
  };
  let onMessage;
  const win = {
    URL, TextDecoder, Request: class {},
    setTimeout: clock.setTimeout, setInterval: clock.setInterval,
    location: { href: "https://www.youtube-nocookie.com/embed/vid1", ancestorOrigins: { length: 1, 0: "https://hackertube.org" } },
    document: { referrer: "", getElementById: (id) => (id === "movie_player" ? player : null) },
    XMLHttpRequest: class { open() {} send() {} },
    fetch: async () => ({ clone: () => ({ text: async () => JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: "hello" }] }] }) }) }),
    addEventListener: (type, fn) => { if (type === "message") onMessage = fn; },
    postMessage: (data) => posted.push(data.type),
  };
  win.window = win;
  const context = vm.createContext(win);
  vm.runInContext(SOURCE, context);
  // inside the context `window` is the context's global, not the `win` object itself: messages must come from it
  const source = vm.runInContext("window", context);
  return {
    clock, player, setOption, posted, win,
    subtitles: (enabled) => onMessage({ source, data: { source: "htz-iso", type: "config", enabled } }),
  };
}

test("switching our subtitles off turns off the YouTube captions we switched on, once", async () => {
  const e = embed();
  e.subtitles(true);
  await e.clock.advance(700);
  assert.deepEqual(e.setOption, [["captions", "track", { languageCode: "en" }]]);
  e.subtitles(false);
  e.subtitles(false);
  assert.deepEqual(e.setOption.slice(1), [["captions", "track", {}]]);
});

test("captions the viewer turned on themselves are left on", async () => {
  const e = embed();
  await e.win.fetch("https://www.youtube.com/api/timedtext?v=vid1&lang=en"); // the player loading its own captions
  await new Promise(setImmediate);
  assert.deepEqual(e.posted.filter((t) => t === "captions"), ["captions"]);
  e.subtitles(true);
  await e.clock.advance(700);
  e.subtitles(false);
  assert.deepEqual(e.setOption, []);
});

test("switched off while the track list was still loading: captions stay off, and switching on again retries", async () => {
  const e = embed({ tracks: [] });
  e.subtitles(true);
  await e.clock.advance(700);  // starts waiting for the track list
  e.subtitles(false);
  e.player.tracks = [{ languageCode: "en" }];
  await e.clock.advance(5000);
  assert.deepEqual(e.setOption, []);
  assert.ok(!e.posted.includes("nocaptions"));
  e.subtitles(true);
  await e.clock.advance(700);
  assert.deepEqual(e.setOption, [["captions", "track", { languageCode: "en" }]]);
});
