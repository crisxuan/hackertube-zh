const R = globalThis.HTZ.runtime;
const $ = (s) => document.querySelector(s);
const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

function setMsg(el, text, cls = "") { el.textContent = text; el.className = cls; }

function paintSegs(s) {
  for (const seg of document.querySelectorAll(".seg")) {
    for (const b of seg.querySelectorAll("button")) b.classList.toggle("on", b.value === s[seg.dataset.key]);
  }
}

function paint(s, secrets) {
  paintSegs(s);
  $("#subScale").value = s.subScale;
  $("#subScaleOut").textContent = `${Math.round(s.subScale * 100)}%`;
  $("#subBottom").value = s.subBottom;
  $("#subBottomOut").textContent = `${s.subBottom}%`;
  $("#searchTranslate").checked = s.searchTranslate;
  $("#embedLogin").checked = s.embedLogin;
  const radio = document.querySelector(`input[name=engine][value="${s.engine}"]`);
  if (radio) radio.checked = true;
  showCfg(s.engine);
  $("#claudeModel").value = s.claudeModel;
  $("#claudeEffort").value = s.claudeEffort;
  $("#openaiBaseUrl").value = s.openaiBaseUrl;
  $("#openaiModel").value = s.openaiModel;
  if (secrets) {
    $("#claudeKey").value = secrets.claudeKey || "";
    $("#openaiKey").value = secrets.openaiKey || "";
  }
}

const showCfg = (engine) => document.querySelectorAll(".cfg").forEach((c) => c.classList.toggle("on", c.dataset.for === engine));
const selectedEngine = () => document.querySelector("input[name=engine]:checked")?.value || "google";

async function refreshCache() {
  const r = await send({ type: "cacheStats" });
  $("#cacheCount").textContent = r && r.ok ? r.entries.toLocaleString("zh-CN") : "?";
}

// Display settings apply immediately; engine settings wait for 保存 because they need keys and permissions.
for (const seg of document.querySelectorAll(".seg")) {
  seg.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (b) paintSegs(await R.saveSettings({ [seg.dataset.key]: b.value }));
  });
}
for (const [id, fmt] of [["subScale", (v) => `${Math.round(v * 100)}%`], ["subBottom", (v) => `${v}%`]]) {
  $(`#${id}`).addEventListener("input", (e) => { $(`#${id}Out`).textContent = fmt(+e.target.value); });
  $(`#${id}`).addEventListener("change", (e) => R.saveSettings({ [id]: +e.target.value }));
}
$("#searchTranslate").addEventListener("change", (e) => R.saveSettings({ searchTranslate: e.target.checked }));
$("#embedLogin").addEventListener("change", (e) => R.saveSettings({ embedLogin: e.target.checked }));
document.querySelectorAll("input[name=engine]").forEach((r) => r.addEventListener("change", () => showCfg(selectedEngine())));

async function save() {
  const msg = $("#msg");
  const engine = selectedEngine();
  const patch = {
    engine,
    claudeModel: $("#claudeModel").value.trim() || R.DEFAULTS.claudeModel,
    claudeEffort: $("#claudeEffort").value,
    openaiBaseUrl: $("#openaiBaseUrl").value.trim().replace(/\/+$/, ""),
    openaiModel: $("#openaiModel").value.trim(),
  };
  if (engine === "claude" && !$("#claudeKey").value.trim()) return setMsg(msg, "请填写 Claude API Key", "err"), false;
  if (engine === "openai") {
    let url;
    try { url = new URL(patch.openaiBaseUrl); } catch { return setMsg(msg, "接口地址不是有效的网址", "err"), false; }
    if (!patch.openaiModel) return setMsg(msg, "请填写模型名", "err"), false;
    // the service worker can only reach hosts the user has granted; ask for exactly this one
    const origin = `${url.protocol}//${url.hostname}/*`;
    const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) return setMsg(msg, `需要授权访问 ${url.hostname} 才能使用该接口`, "err"), false;
  }
  await R.saveSecrets({ claudeKey: $("#claudeKey").value.trim(), openaiKey: $("#openaiKey").value.trim() });
  await R.saveSettings(patch);
  setMsg(msg, "已保存", "ok");
  return true;
}

$("#save").addEventListener("click", save);
$("#test").addEventListener("click", async () => {
  const msg = $("#msg");
  if (!(await save())) return;
  setMsg(msg, "测试中…");
  const r = await send({ type: "testEngine" });
  if (r && r.ok) setMsg(msg, `${r.engine} 可用（${r.ms} ms）：${r.translations.join(" / ")}`, "ok");
  else setMsg(msg, `失败：${r ? r.error : "无响应"}`, "err");
});
$("#clearCache").addEventListener("click", async () => {
  const r = await send({ type: "clearCache" });
  setMsg($("#cacheMsg"), r && r.ok ? `已清除 ${r.removed} 条` : "清除失败", r && r.ok ? "ok" : "err");
  refreshCache();
});

Promise.all([R.loadSettings(), R.loadSecrets()]).then(([s, secrets]) => paint(s, secrets));
refreshCache();
