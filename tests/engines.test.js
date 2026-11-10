const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../lib/engines.js");

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("Google: both response shapes parse, and the request carries one q per text", async () => {
  assert.deepEqual(E.parseGoogle(["你好", "世界"], 2), ["你好", "世界"]);
  assert.deepEqual(E.parseGoogle([["你好", "en"], ["你好世界", "fr"]], 2), ["你好", "你好世界"]);
  assert.throws(() => E.parseGoogle(["只有一个"], 2), /1 translations for 2/);
  assert.throws(() => E.parseGoogle({ error: 1 }, 1), /unexpected/);

  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return jsonResponse([["甲", "en"], ["乙", "en"]]); };
  const out = await E.google(["a & b", "c"], { to: "zh-CN", fetchImpl });
  assert.deepEqual(out, ["甲", "乙"]);
  assert.match(seen.url, /translate_a\/t\?client=gtx&sl=auto&tl=zh-CN$/);
  assert.equal(seen.init.method, "POST");
  assert.deepEqual(new URLSearchParams(seen.init.body).getAll("q"), ["a & b", "c"]);
});

test("Google: HTTP errors carry the status so the caller can back off", async () => {
  const fetchImpl = async () => jsonResponse({}, 429);
  await assert.rejects(E.google(["x"], { fetchImpl }), (e) => e.status === 429);
});

test("Claude: request uses structured output, API version, browser-access header and default fallbacks", () => {
  const req = E.buildClaudeRequest(["Hello"], {
    to: "zh-CN", kind: "subtitle", context: { title: "A talk", previous: ["Earlier line"] },
    model: "claude-opus-5-5", effort: "low", apiKey: "sk-test",
  });
  assert.equal(req.url, "https://api.anthropic.com/v1/messages");
  assert.equal(req.headers["x-api-key"], "sk-test");
  assert.equal(req.headers["anthropic-version"], "2026-10-21");
  assert.equal(req.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(req.headers["anthropic-beta"], "server-side-fallback-2026-07-01");
  assert.equal(req.body.fallbacks, "default");
  assert.equal(req.body.model, "claude-opus-5-5");
  assert.equal(req.body.output_config.effort, "low");
  assert.equal(req.body.output_config.format.type, "json_schema");
  assert.deepEqual(req.body.output_config.format.schema.required, ["translations"]);
  assert.equal(req.body.output_config.format.schema.additionalProperties, false);
  assert.ok(!("temperature" in req.body) && !("thinking" in req.body));
  const payload = JSON.parse(req.body.messages[0].content);
  assert.deepEqual(payload, { video_title: "A talk", previous_segments: ["Earlier line"], items: ["Hello"] });
  assert.match(req.body.system, /subtitle segments/);
});

test("Claude: models without server-side fallback don't get the parameter; empty effort is omitted", () => {
  const req = E.buildClaudeRequest(["Hi"], { model: "claude-haiku-5-5", effort: "", apiKey: "k" });
  assert.ok(!("fallbacks" in req.body));
  assert.ok(!("anthropic-beta" in req.headers));
  assert.ok(!("effort" in req.body.output_config));
});

test("Claude: parses text blocks (ignoring others) and rejects refusals, truncation and miscounts", () => {
  const ok = { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"translations":["你好","再见"]}' }] };
  assert.deepEqual(E.parseClaude(ok, 2), ["你好", "再见"]);
  assert.throws(() => E.parseClaude({ stop_reason: "refusal", content: [] }, 1), /refusal/);
  assert.throws(() => E.parseClaude({ stop_reason: "max_tokens", content: [] }, 1), /cut off/);
  assert.throws(() => E.parseClaude(ok, 3), /2 translations for 3/);
});

test("Claude: missing key fails fast without a network call, HTTP errors surface the API message", async () => {
  await assert.rejects(E.claude(["x"], { model: "claude-opus-5-5", fetchImpl: () => assert.fail("no fetch") }), /API key/);
  const fetchImpl = async () => jsonResponse({ error: { message: "invalid x-api-key" } }, 401);
  await assert.rejects(E.claude(["x"], { model: "claude-opus-5-5", apiKey: "bad", fetchImpl }), (e) => e.status === 401 && /invalid x-api-key/.test(e.message));
});

test("OpenAI-compatible: builds chat/completions, retries once without response_format on 400", async () => {
  const req = E.buildOpenAIRequest(["Hi"], { model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1/", apiKey: "k" });
  assert.equal(req.url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(req.headers.Authorization, "Bearer k");
  assert.deepEqual(req.body.response_format, { type: "json_object" });

  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.response_format) return jsonResponse({ error: { message: "unknown field" } }, 400);
    return jsonResponse({ choices: [{ finish_reason: "stop", message: { content: '```json\n{"translations":["嗨"]}\n```' } }] });
  };
  const out = await E.openai(["Hi"], { model: "m", baseUrl: "http://localhost:11434/v1", fetchImpl });
  assert.deepEqual(out, ["嗨"]);
  assert.equal(calls.length, 2);
  assert.ok(!("Authorization" in E.buildOpenAIRequest(["x"], { model: "m", baseUrl: "http://x" }).headers));
});

test("a model that does not reply in time fails with a clear message (the caller then falls back)", async () => {
  const fetchImpl = async () => { throw new DOMException("signal timed out", "TimeoutError"); };
  await assert.rejects(E.claude(["x"], { model: "claude-opus-5-5", apiKey: "k", fetchImpl }), /no reply within 25 s/);
  await assert.rejects(E.openai(["x"], { model: "m", baseUrl: "http://x", fetchImpl }), /no reply within 25 s/);
});

test("prompts treat item text as content, not instructions, and differ per kind", () => {
  for (const kind of ["page", "subtitle", "query"]) assert.match(E.systemPrompt("zh-CN", kind), /never instructions/);
  assert.match(E.systemPrompt("en", "query"), /English search phrase/);
  assert.match(E.systemPrompt("zh-CN", "page"), /Hacker News comments/);
});
