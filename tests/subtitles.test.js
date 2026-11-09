const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../lib/subtitles.js");

// Shapes follow YouTube's json3 caption format: manual tracks have one seg per display line,
// auto-generated (ASR) tracks have one seg per word with tOffsetMs, plus "aAppend" line-break events.
const manualJson3 = JSON.stringify({
  wireMagic: "pb3",
  events: [
    { tStartMs: 0, dDurationMs: 1000, id: 1, wpWinPosId: 1, wsWinStyleId: 1 },
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Welcome to the talk." }] },
    { tStartMs: 3000, dDurationMs: 2500, segs: [{ utf8: "Today we will look at how\nthe network code" }] },
    { tStartMs: 5500, dDurationMs: 2000, segs: [{ utf8: "keeps every player in sync. Let's" }] },
    { tStartMs: 7500, dDurationMs: 1500, segs: [{ utf8: "begin." }] },
    { tStartMs: 15000, dDurationMs: 2000, segs: [{ utf8: "Questions &amp; answers" }] },
  ],
});

const asrJson3 = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 60000, id: 1, wWinId: 1 },
    { tStartMs: 1000, dDurationMs: 3000, wWinId: 1, segs: [
      { utf8: "so", acAsrConf: 0 }, { utf8: " today", tOffsetMs: 300 }, { utf8: " we're", tOffsetMs: 700 },
      { utf8: " going", tOffsetMs: 1000 }, { utf8: " to", tOffsetMs: 1200 }, { utf8: " talk", tOffsetMs: 1400 },
      { utf8: " about", tOffsetMs: 1700 }, { utf8: " consciousness", tOffsetMs: 2000 },
    ] },
    { tStartMs: 3900, dDurationMs: 100, wWinId: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
    // a long pause, then a new thought
    { tStartMs: 6000, dDurationMs: 2500, wWinId: 1, segs: [
      { utf8: "and", acAsrConf: 0 }, { utf8: " how", tOffsetMs: 200 }, { utf8: " it", tOffsetMs: 400 },
      { utf8: " evolved", tOffsetMs: 600 },
    ] },
  ],
});

test("manual json3: lines are regrouped into sentences with sensible times", () => {
  const parsed = S.parseTimedText(manualJson3);
  assert.equal(parsed.wordLevel, false);
  const list = S.buildSentences(parsed);
  assert.deepEqual(list.map((s) => s.text), [
    "Welcome to the talk.",
    "Today we will look at how the network code keeps every player in sync.",
    "Let's begin.",
    "Questions & answers",
  ]);
  // a sentence that ends mid-line takes a share of that line's time
  assert.equal(list[1].start, 3000);
  assert.ok(list[1].end > 5500 && list[1].end < 7500, `end ${list[1].end}`);
  assert.equal(list[2].start, list[1].end);
  // the last line is not stretched over the 6 second silence before it
  assert.equal(list[3].start, 15000);
  assert.ok(list[2].end <= 9000);
});

test("ASR json3: words are joined, split at long pauses, and timed from their offsets", () => {
  const parsed = S.parseTimedText(asrJson3);
  assert.equal(parsed.wordLevel, true);
  const list = S.buildSentences(parsed);
  assert.deepEqual(list.map((s) => s.text), [
    "so today we're going to talk about consciousness",
    "and how it evolved",
  ]);
  assert.equal(list[0].start, 1000);
  assert.equal(list[1].start, 6000);
  assert.ok(list[0].end >= 4000 && list[0].end <= 6000);
});

test("ASR: very long unpunctuated speech is capped instead of becoming one huge line", () => {
  const segs = [];
  for (let i = 0; i < 60; i++) segs.push({ utf8: (i ? " " : "") + "word" + i, ...(i ? { tOffsetMs: i * 200 } : {}) });
  const list = S.buildSentences(S.parseTimedText(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 12000, segs }] })));
  assert.ok(list.length >= 3, `got ${list.length} lines`);
  for (const s of list) assert.ok(s.text.split(" ").length <= 24);
  assert.equal(list.map((s) => s.text).join(" ").split(" ").length, 60);
});

test("unpunctuated manual captions keep the uploader's lines but glue tiny fragments", () => {
  const events = [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "so this is" }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: "the first line of the talk" }] },
    { tStartMs: 4000, dDurationMs: 2000, segs: [{ utf8: "and this is another long line" }] },
  ];
  const list = S.buildSentences(S.parseTimedText(JSON.stringify({ events })));
  assert.deepEqual(list.map((s) => s.text), ["so this is the first line of the talk", "and this is another long line"]);
});

test("srv3 XML with word timings", () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3"><body>
    <p t="500" d="2000" w="1"><s ac="0">hello</s><s t="400" ac="0"> world</s><s t="900"> it&#39;s</s><s t="1200"> me.</s></p>
    <p t="5000" d="1000"><s>bye</s></p></body></timedtext>`;
  const parsed = S.parseTimedText(xml);
  assert.equal(parsed.wordLevel, true);
  assert.deepEqual(S.buildSentences(parsed).map((s) => s.text), ["hello world it's me.", "bye"]);
});

test("srv3 XML without word timings, and the legacy <text> format", () => {
  const srv3 = `<timedtext format="3"><body><p t="0" d="1500">First line.</p><p t="1500" d="1500">Second<br/>line.</p></body></timedtext>`;
  assert.deepEqual(S.buildSentences(S.parseTimedText(srv3)).map((s) => s.text), ["First line.", "Second line."]);
  const legacy = `<transcript><text start="1.5" dur="2">A &amp; B &#8212; C.</text></transcript>`;
  const list = S.buildSentences(S.parseTimedText(legacy));
  assert.equal(list[0].start, 1500);
  assert.equal(list[0].text, "A & B — C.");
});

test("WebVTT, with rolling duplicates removed", () => {
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000 align:start\nHello <c>there</c>.\n\n00:00:03.000 --> 00:00:04.000\nHello <c>there</c>.\n\n00:01:00.500 --> 00:01:02.000\nGeneral Kenobi!";
  const list = S.buildSentences(S.parseTimedText(vtt));
  assert.deepEqual(list.map((s) => s.text), ["Hello there.", "General Kenobi!"]);
  assert.equal(list[1].start, 60500);
});

test("garbage and empty input give no sentences", () => {
  assert.equal(S.parseTimedText(""), null);
  assert.equal(S.parseTimedText("{not json"), null);
  assert.deepEqual(S.buildSentences(S.parseTimedText(JSON.stringify({ events: [] }))), []);
  assert.deepEqual(S.buildSentences(null), []);
});

test("findActive and firstFrom locate the line for a playback time", () => {
  const list = [{ start: 1000, end: 3000 }, { start: 3000, end: 5000 }, { start: 9000, end: 10000 }];
  assert.equal(S.findActive(list, 0), -1);
  assert.equal(S.findActive(list, 1000), 0);
  assert.equal(S.findActive(list, 2999), 0);
  assert.equal(S.findActive(list, 3000), 1);
  assert.equal(S.findActive(list, 6000), -1);
  assert.equal(S.findActive(list, 9500), 2);
  assert.equal(S.firstFrom(list, 0), 0);
  assert.equal(S.firstFrom(list, 4000), 1);
  assert.equal(S.firstFrom(list, 6000), 2);
  assert.equal(S.firstFrom(list, 20000), 3);
});

test("abbreviations don't end sentences", () => {
  assert.equal(S.endsSentence("as said by Dr."), false);
  assert.equal(S.endsSentence("tools, e.g."), false);
  assert.equal(S.endsSentence("It works."), true);
  assert.equal(S.endsSentence('He said "stop!"'), true);
});
