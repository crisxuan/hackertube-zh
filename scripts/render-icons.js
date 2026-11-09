// Render the logo artwork with headless Chrome as the renderer (no image libraries needed):
//   icons/icon.svg, icons/icon-small.svg  → icons/icon{16,32,48,128}.png  (extension icons)
//   icons/icon.svg + text                 → docs/logo-light.png, docs/logo-dark.png  (README wordmark)
// Run: npm run icons   (set CHROME_PATH if Chrome isn't found). The wordmark uses the system's fonts; it was
// made on macOS (Avenir Next + PingFang SC), elsewhere the fallbacks in WORDMARK_CSS apply.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ICONS = path.join(ROOT, "icons");
// size, source art, transparent margin. The 128 px icon keeps a margin like other store icons; the toolbar
// sizes (16, 32) use the simplified art, which stays legible at a few pixels.
const TARGETS = [
  { size: 16, svg: "icon-small.svg", margin: 0 },
  { size: 32, svg: "icon-small.svg", margin: 0 },
  { size: 48, svg: "icon.svg", margin: 0 },
  { size: 128, svg: "icon.svg", margin: 8 },
];
// "Hacker" in ink colour, "Tube" in orange, then a 中文插件 tag; one variant per README colour scheme
const WORDMARKS = [
  { out: "docs/logo-light.png", ink: "#141414", tag: "#FFE9D9", tagInk: "#1A1A1A" },
  { out: "docs/logo-dark.png", ink: "#F3F3F3", tag: "#3B2A20", tagInk: "#FFE3CF" },
];
const WORDMARK_SIZE = { width: 940, height: 250 };
const WORDMARK_CSS = {
  latin: "'Avenir Next', 'Poppins', 'Helvetica Neue', Arial, sans-serif",
  cjk: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
};

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome not found; set CHROME_PATH");
  return found;
}

function shoot(chrome, tmp, html, out, width, height, scale = 1) {
  const page = path.join(tmp, `${path.basename(out)}.html`);
  fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:transparent">${html}</body></html>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync(chrome, [
    "--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    // a throwaway profile, so this never touches the browser profile in use
    `--user-data-dir=${path.join(tmp, "profile")}`, `--force-device-scale-factor=${scale}`,
    "--default-background-color=00000000", `--window-size=${width},${height}`, `--screenshot=${out}`,
    `file://${page}`,
  ], { stdio: "pipe", timeout: 60000 });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`rendering ${out} failed:\n${r.stderr}`);
  console.log(path.relative(ROOT, out));
}

function main() {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "htz-icons-"));
  try {
    for (const { size, svg, margin } of TARGETS) {
      const art = size - 2 * margin;
      shoot(chrome, tmp, `<img src="file://${path.join(ICONS, svg)}" width="${art}" height="${art}" style="display:block;margin:${margin}px">`,
        path.join(ICONS, `icon${size}.png`), size, size);
    }
    const { width, height } = WORDMARK_SIZE;
    for (const w of WORDMARKS) {
      shoot(chrome, tmp, `
        <div style="display:flex;align-items:center;gap:26px;width:${width}px;height:${height}px;padding:0 14px;box-sizing:border-box">
          <img src="file://${path.join(ICONS, "icon.svg")}" width="236" height="236" style="flex:none">
          <div>
            <div style="font:700 112px/1 ${WORDMARK_CSS.latin};letter-spacing:-2px;color:${w.ink};white-space:nowrap">Hacker<span style="color:#FF5A1F">Tube</span></div>
            <div style="display:inline-block;margin-top:16px;padding:9px 30px 9px 36px;border-radius:999px;background:${w.tag};color:${w.tagInk};
              font:600 44px/1.2 ${WORDMARK_CSS.cjk};letter-spacing:12px">中文插件</div>
          </div>
        </div>`, path.join(ROOT, w.out), width, height, 2);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
