// Render icons/icon.svg and icons/icon-small.svg to the PNG sizes Chrome needs, using headless Chrome as the
// SVG renderer (no image libraries needed). Run: npm run icons   (set CHROME_PATH if Chrome isn't found)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ICONS = path.join(__dirname, "..", "icons");
// size, source art, transparent margin. The 128 px icon keeps a margin like other store icons; the toolbar
// sizes (16, 32) use the simplified art, which stays legible at a few pixels.
const TARGETS = [
  { size: 16, svg: "icon-small.svg", margin: 0 },
  { size: 32, svg: "icon-small.svg", margin: 0 },
  { size: 48, svg: "icon.svg", margin: 0 },
  { size: 128, svg: "icon.svg", margin: 10 },
];

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

function main() {
  const chrome = findChrome();
  // a throwaway profile, so this never touches the browser profile in use
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "htz-icons-"));
  try {
    for (const { size, svg, margin } of TARGETS) {
      const page = path.join(tmp, `icon${size}.html`);
      const art = size - 2 * margin;
      fs.writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">
        <img src="file://${path.join(ICONS, svg)}" width="${art}" height="${art}" style="display:block;margin:${margin}px"></body></html>`);
      const out = path.join(ICONS, `icon${size}.png`);
      const r = spawnSync(chrome, [
        "--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
        `--user-data-dir=${path.join(tmp, "profile")}`, "--force-device-scale-factor=1",
        "--default-background-color=00000000", `--window-size=${size},${size}`, `--screenshot=${out}`,
        `file://${page}`,
      ], { stdio: "pipe", timeout: 60000 });
      if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`rendering ${size}px failed:\n${r.stderr}`);
      console.log(`icons/icon${size}.png  ← ${svg}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
