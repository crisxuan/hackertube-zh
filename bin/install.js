#!/usr/bin/env node
// npx hackertube-zh — put the extension in a fixed folder Chrome can load it from, then walk the user through the
// last two clicks. Chrome doesn't let scripts finish the job: release builds ignore chrome:// URLs passed on the
// command line, and loading an unpacked extension needs Developer mode, which only the user can switch on.
// Running it again updates the files in place; Chrome then needs one click on the extension's reload button.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PKG_ROOT = path.join(__dirname, "..");
// everything the browser loads; scripts/check.js verifies this covers every file the manifest references
const EXTENSION_FILES = ["manifest.json", "background.js", "lib", "content", "popup", "options", "ui", "icons"];
const EXTENSIONS_URL = "chrome://extensions";
const DEFAULT_DIR = path.join(os.homedir(), "hackertube-zh"); // visible, so the folder picker finds it easily

const readManifest = (dir) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")); } catch { return null; }
};

// Copy the extension into `dir`. Refuses to touch a non-empty folder that isn't a previous install.
function install(dir, src = PKG_ROOT) {
  const target = path.resolve(dir);
  if (target === path.resolve(src)) throw new Error("目标文件夹就是扩展源码目录本身，请换一个 --dir");
  const ours = readManifest(src);
  const existing = fs.existsSync(target) ? fs.readdirSync(target) : [];
  const previous = existing.length ? readManifest(target) : null;
  if (existing.length && (!previous || previous.name !== ours.name)) {
    throw new Error(`${target} 已存在且不是本扩展的安装目录，为避免覆盖你的文件，已停止。可以用 --dir 指定别的位置。`);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const entry of EXTENSION_FILES) {
    // replace whole entries so files removed in a new version don't linger
    fs.rmSync(path.join(target, entry), { recursive: true, force: true });
    fs.cpSync(path.join(src, entry), path.join(target, entry), { recursive: true });
  }
  return { dir: target, version: ours.version, previousVersion: previous && previous.version };
}

// The desktop conveniences for each OS: put chrome://extensions on the clipboard, show the folder in the file
// manager (so it can be dragged onto the extensions page), and bring Chrome to the front.
function plan(platform, dir) {
  if (platform === "darwin") {
    return [
      { what: "clipboard", cmd: "pbcopy", args: [], input: EXTENSIONS_URL },
      { what: "reveal", cmd: "open", args: ["-R", dir] },
      { what: "browser", cmd: "open", args: ["-a", "Google Chrome"] },
    ];
  }
  if (platform === "win32") {
    return [
      { what: "clipboard", cmd: "clip", args: [], input: EXTENSIONS_URL },
      { what: "reveal", cmd: "explorer", args: [`/select,${dir}`] },
      { what: "browser", cmd: "cmd", args: ["/c", "start", "", "chrome"] },
    ];
  }
  return [
    { what: "clipboard", cmd: "wl-copy", args: [], input: EXTENSIONS_URL },
    { what: "clipboard", cmd: "xclip", args: ["-selection", "clipboard"], input: EXTENSIONS_URL },
    { what: "reveal", cmd: "xdg-open", args: [path.dirname(dir)] },
  ];
}

// Best effort: a missing tool just means that convenience is skipped. Returns which conveniences worked.
function runPlan(steps) {
  const done = new Set();
  for (const s of steps) {
    if (done.has(s.what)) continue;
    const r = spawnSync(s.cmd, s.args, { input: s.input, stdio: [s.input == null ? "ignore" : "pipe", "ignore", "ignore"], timeout: 5000 });
    // explorer.exe exits with 1 even when it worked
    if (!r.error && (r.status === 0 || (s.cmd === "explorer" && r.status === 1))) done.add(s.what);
  }
  return done;
}

function usage() {
  return `用法：npx hackertube-zh [选项]

把「HackerTube 中文助手」Chrome 扩展放到固定文件夹，并引导你在 Chrome 里加载它。
再次运行即更新。

选项：
  --dir <路径>   安装到指定文件夹（默认 ${DEFAULT_DIR}）
  --no-open      只复制文件：不写剪贴板、不打开文件夹和 Chrome
  -h, --help     显示帮助`;
}

function parseArgs(argv) {
  const opts = { dir: DEFAULT_DIR, open: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--no-open") opts.open = false;
    else if (a === "--dir") {
      if (!argv[i + 1]) throw new Error("--dir 需要一个路径");
      opts.dir = argv[++i].replace(/^~(?=$|[\\/])/, os.homedir());
    } else throw new Error(`不认识的参数：${a}\n\n${usage()}`);
  }
  return opts;
}

function main(argv = process.argv.slice(2), platform = process.platform) {
  const opts = parseArgs(argv);
  if (opts.help) return console.log(usage());

  const res = install(opts.dir);
  const done = opts.open ? runPlan(plan(platform, res.dir)) : new Set();
  const tty = process.stdout.isTTY;
  const b = (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s);
  const g = (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s);
  const urlHint = done.has("clipboard") ? `（已复制，粘贴即可）` : "";
  const picker = platform === "darwin" ? "（文件选择框里按 ⌘⇧G 可以直接输入路径）" : "";
  const lines = [];

  if (res.previousVersion) {
    const head = res.previousVersion === res.version
      ? `✔ HackerTube 中文助手已是最新版本（${res.version}），文件已重新写入：`
      : `✔ HackerTube 中文助手已更新：${res.previousVersion} → ${res.version}`;
    lines.push(g(head), `  ${res.dir}`, "",
      "让 Chrome 用上新版本：",
      `  1. 在 Chrome 地址栏打开 ${b(EXTENSIONS_URL)}${urlHint}`,
      `  2. 在「HackerTube 中文助手」卡片上点刷新按钮 ↻，再刷新 HackerTube 页面`);
  } else {
    lines.push(g(`✔ HackerTube 中文助手 ${res.version} 已放到：`), `  ${b(res.dir)}`, "",
      "在 Chrome 里还差三步（只需做一次）：",
      `  1. 在 Chrome 地址栏打开 ${b(EXTENSIONS_URL)}${urlHint}`,
      `  2. 打开页面右上角的「开发者模式」`,
      `  3. 点「加载已解压的扩展程序」，选择上面这个文件夹${picker}`,
      done.has("reveal") ? `     也可以直接把刚弹出的 ${path.basename(res.dir)} 文件夹拖到扩展页面上` : "",
      "",
      "之后打开 https://hackertube.org 就是中文了。以后更新：再运行一次 npx hackertube-zh。",
      "提示：如果之前从别的文件夹加载过这个扩展（比如源码目录），请先在扩展页移除旧的，否则会重复翻译。");
  }
  console.log(lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n"));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(`✖ ${e.message}`); process.exit(1); }
}

module.exports = { EXTENSION_FILES, DEFAULT_DIR, install, plan, parseArgs, main };
