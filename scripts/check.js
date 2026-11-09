// Static checks for the unpacked extension: the manifest parses, every file it or the HTML pages reference
// exists, and every JavaScript file is syntactically valid. Run: npm run check
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const errors = [];
const exists = (p) => fs.existsSync(path.join(root, p));

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const refs = new Set([
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
]);

// background.js is an ES module: its imports must exist too
const bg = fs.readFileSync(path.join(root, manifest.background.service_worker), "utf8");
for (const m of bg.matchAll(/^import\s+["'](.+?)["']/gm)) refs.add(path.normalize(path.join(path.dirname(manifest.background.service_worker), m[1])));

for (const page of [manifest.action.default_popup, manifest.options_page]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) refs.add(path.normalize(path.join(path.dirname(page), m[1])));
}

for (const r of refs) if (!exists(r)) errors.push(`missing file: ${r}`);

// the npx installer and the npm package must ship every file the browser loads, at the same version
const pkg = require("../package.json");
const { EXTENSION_FILES } = require("../bin/install.js");
const top = (r) => r.split(/[\\/]/)[0];
for (const r of refs) if (!EXTENSION_FILES.includes(top(r))) errors.push(`bin/install.js EXTENSION_FILES misses ${r}`);
for (const e of EXTENSION_FILES) if (!pkg.files.includes(e)) errors.push(`package.json "files" misses ${e}`);
if (!pkg.files.includes("bin")) errors.push(`package.json "files" misses bin`);
if (pkg.version !== manifest.version) errors.push(`version mismatch: package.json ${pkg.version} vs manifest.json ${manifest.version}`);

const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "dist", ".git"].includes(e.name)) walk(rel); }
    else if (e.name.endsWith(".js")) jsFiles.push(rel);
  }
})(".");
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ["--check", path.join(root, f)], { stdio: "pipe" }); }
  catch (e) { errors.push(`syntax error in ${f}:\n${e.stderr}`); }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok: manifest v${manifest.version}, ${refs.size} referenced files present, ${jsFiles.length} JS files parse`);
