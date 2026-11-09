const test = require("node:test");
const assert = require("node:assert/strict");
const EL = require("../lib/embedlogin.js");

// declarativeNetRequest evaluates regexFilter with RE2 and substitutes \1; for these simple patterns JS regex
// behaves the same, so the rule's effect on real HackerTube embed URLs can be checked here.
function apply(rule, url) {
  const re = new RegExp(rule.condition.regexFilter);
  if (!re.test(url)) return null;
  return url.replace(re, rule.action.redirect.regexSubstitution.replace(/\\(\d)/g, "$$$1"));
}

test("HackerTube's embed URLs move to youtube.com/embed with the same id and parameters", () => {
  const r = EL.rule();
  assert.equal(apply(r, "https://www.youtube-nocookie.com/embed/9QWaZp_2I1k?rel=0&autoplay=1"),
    "https://www.youtube.com/embed/9QWaZp_2I1k?rel=0&autoplay=1");
  assert.equal(apply(r, "https://www.youtube-nocookie.com/embed/W3aieHjyNvw?rel=0"),
    "https://www.youtube.com/embed/W3aieHjyNvw?rel=0");
});

test("the rule touches only embed frames that HackerTube loads", () => {
  const r = EL.rule();
  assert.equal(apply(r, "https://www.youtube-nocookie.com/youtubei/v1/player"), null);
  assert.equal(apply(r, "https://www.youtube.com/embed/abc"), null);
  assert.equal(apply(r, "https://evil.example/https://www.youtube-nocookie.com/embed/abc"), null);
  assert.deepEqual(r.condition.resourceTypes, ["sub_frame"]);
  assert.deepEqual(r.condition.initiatorDomains, ["hackertube.org"]);
});

test("sync adds the rule when enabled and only removes it when disabled", async () => {
  const calls = [];
  const dnr = { updateDynamicRules: async (arg) => { calls.push(arg); } };
  await EL.sync(true, dnr);
  await EL.sync(false, dnr);
  assert.deepEqual(calls[0].removeRuleIds, [EL.RULE_ID]);
  assert.equal(calls[0].addRules.length, 1);
  assert.equal(calls[0].addRules[0].id, EL.RULE_ID);
  assert.deepEqual(calls[1], { removeRuleIds: [EL.RULE_ID], addRules: [] });
});
