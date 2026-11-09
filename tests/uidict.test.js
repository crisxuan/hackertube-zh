const test = require("node:test");
const assert = require("node:assert/strict");
const { localize } = require("../lib/uidict.js");
const T = require("../lib/textutil.js");

test("exact interface strings", () => {
  assert.equal(localize("Home"), "首页");
  assert.equal(localize("  Watch later  "), "稍后观看");
  assert.equal(localize("Play all on YouTube"), "在 YouTube 上全部播放");
  assert.equal(localize("Strongly recommends"), "强烈推荐");
});

test("view counts and dates, alone and joined the way the site joins them", () => {
  assert.equal(localize("196K views • 7 years ago"), "19.6万次观看 • 7 年前");
  assert.equal(localize("2.3M views • 19 years ago"), "230万次观看 • 19 年前");
  assert.equal(localize("1.2B views • today"), "12亿次观看 • 今天");
  assert.equal(localize("812 views • 1 month ago"), "812次观看 • 1 个月前");
  assert.equal(localize("333K views · 3 years ago · lecture · evergreen"), "33.3万次观看 · 3 年前 · 讲座 · 常青");
  assert.equal(localize("12 videos · 3 hr 5 min"), "12 个视频 · 3 小时 5 分钟");
  assert.equal(localize("Curated by Claude · 8 videos · 45 min"), "由 Claude 精选 · 8 个视频 · 45 分钟");
});

test("sentences with numbers and quoted names", () => {
  assert.equal(localize("3 HN recommenders · recommended in 4 months, 2015–2023"), "3 位 HN 用户推荐 · 在 4 个不同月份被推荐，2015–2023");
  assert.equal(localize("Cited 5× on HN, 2015–2023"), "在 HN 被引用 5 次，2015–2023");
  assert.equal(localize("1 comment from Hacker News"), "来自 Hacker News 的 1 条评论");
  assert.equal(localize("2024 · in “Ask HN: Best Audiobooks?”"), "2024 · 发表于「Ask HN: Best Audiobooks?」");
  assert.equal(localize("No strong matches for “rust”. Here are the closest videos."), "没有与“rust”高度匹配的视频，以下是最接近的结果。");
});

test("unknown text is left alone, including lines where only some pieces are known", () => {
  assert.equal(localize("GDC Festival of Gaming"), null);
  assert.equal(localize("The Royal Institution • 7 years ago"), null);
  assert.equal(localize(""), null);
});

test("text helpers", () => {
  assert.equal(T.hasCJK("分布式 systems"), true);
  assert.equal(T.hasCJK("systems"), false);
  assert.equal(T.needsTranslation("2015–2023"), false);
  assert.equal(T.needsTranslation("Rust"), true);
  assert.equal(T.normalize("  a \n b  "), "a b");
  assert.equal(T.hash("abc"), T.hash("abc"));
  assert.notEqual(T.hash("abc"), T.hash("abd"));
  assert.deepEqual(T.chunk(["aa", "bb", "cc", "dd"], { maxItems: 3, maxChars: 100 }), [[0, 1, 2], [3]]);
  assert.deepEqual(T.chunk(["aaaa", "bbbb", "cc"], { maxItems: 10, maxChars: 6 }), [[0], [1, 2]]);
  assert.deepEqual(T.chunk(["a very long single text"], { maxChars: 3 }), [[0]]);
});
