const R = globalThis.HTZ.runtime;
const $ = (s) => document.querySelector(s);

async function engineHint(s) {
  const secrets = await R.loadSecrets();
  const el = $("#engineHint");
  el.className = "hint";
  if (s.engine === "google") el.textContent = "免费可用。需要能访问 translate.googleapis.com 的网络。";
  else if (s.engine === "claude") {
    el.textContent = secrets.claudeKey ? `模型：${s.claudeModel}` : "还没有填写 Claude API Key，请到“更多设置”中填写。";
    if (!secrets.claudeKey) el.classList.add("err");
  } else {
    const ready = s.openaiBaseUrl && s.openaiModel;
    el.textContent = ready ? `${s.openaiModel} @ ${new URL(s.openaiBaseUrl).host}` : "还没有配置接口地址和模型，请到“更多设置”中填写。";
    if (!ready) el.classList.add("err");
  }
}

function paint(s) {
  for (const seg of document.querySelectorAll(".seg")) {
    for (const b of seg.querySelectorAll("button")) b.classList.toggle("on", b.value === s[seg.dataset.key]);
  }
  $("#subScale").value = s.subScale;
  $("#subScaleOut").textContent = `${Math.round(s.subScale * 100)}%`;
  $("#engine").value = s.engine;
  $("#embedLogin").checked = s.embedLogin;
  engineHint(s);
}

R.loadSettings().then(paint);

for (const seg of document.querySelectorAll(".seg")) {
  seg.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (b) paint(await R.saveSettings({ [seg.dataset.key]: b.value }));
  });
}
// label follows the drag; the setting is written once on release (storage.sync limits writes per minute)
$("#subScale").addEventListener("input", (e) => { $("#subScaleOut").textContent = `${Math.round(e.target.value * 100)}%`; });
$("#subScale").addEventListener("change", async (e) => paint(await R.saveSettings({ subScale: +e.target.value })));
$("#engine").addEventListener("change", async (e) => paint(await R.saveSettings({ engine: e.target.value })));
$("#embedLogin").addEventListener("change", async (e) => paint(await R.saveSettings({ embedLogin: e.target.checked })));
$("#openOptions").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
