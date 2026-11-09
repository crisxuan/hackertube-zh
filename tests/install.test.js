const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const I = require("../bin/install.js");

const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "htz-install-")); made.push(d); return d; };
test.after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));

test("fresh install copies exactly the extension files", () => {
  const dir = path.join(tmp(), "hackertube-zh");
  const res = I.install(dir);
  assert.equal(res.previousVersion, null);
  assert.equal(res.version, manifest.version);
  assert.deepEqual(fs.readdirSync(dir).sort(), [...I.EXTENSION_FILES].sort());
  assert.ok(fs.existsSync(path.join(dir, "content", "player-main.js")));
  assert.ok(!fs.existsSync(path.join(dir, "tests")) && !fs.existsSync(path.join(dir, "dev")));
});

test("running again updates in place and drops files that no longer exist", () => {
  const dir = path.join(tmp(), "ext");
  I.install(dir);
  fs.writeFileSync(path.join(dir, "lib", "removed-in-new-version.js"), "");
  const res = I.install(dir);
  assert.equal(res.previousVersion, manifest.version);
  assert.ok(!fs.existsSync(path.join(dir, "lib", "removed-in-new-version.js")));
});

test("refuses to write into a folder that holds something else, or into the source itself", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "notes.txt"), "mine");
  assert.throws(() => I.install(dir), /不是本扩展的安装目录/);
  assert.equal(fs.readFileSync(path.join(dir, "notes.txt"), "utf8"), "mine");
  assert.throws(() => I.install(path.join(__dirname, "..")), /源码目录/);
});

test("an existing empty folder is fine", () => {
  const dir = tmp();
  assert.equal(I.install(dir).previousVersion, null);
});

test("desktop steps per OS: clipboard gets chrome://extensions, the folder is revealed", () => {
  const mac = I.plan("darwin", "/Users/a/hackertube-zh");
  assert.deepEqual(mac.find((s) => s.what === "clipboard"), { what: "clipboard", cmd: "pbcopy", args: [], input: "chrome://extensions" });
  assert.deepEqual(mac.find((s) => s.what === "reveal").args, ["-R", "/Users/a/hackertube-zh"]);
  assert.deepEqual(mac.find((s) => s.what === "browser").args, ["-a", "Google Chrome"]);
  const win = I.plan("win32", "C:\\Users\\a\\hackertube-zh");
  assert.equal(win.find((s) => s.what === "clipboard").cmd, "clip");
  assert.deepEqual(win.find((s) => s.what === "reveal").args, ["/select,C:\\Users\\a\\hackertube-zh"]);
  const linux = I.plan("linux", "/home/a/hackertube-zh");
  assert.deepEqual(linux.filter((s) => s.what === "clipboard").map((s) => s.cmd), ["wl-copy", "xclip"]);
  // nothing tries to open chrome:// on the command line: Chrome ignores it there
  for (const steps of [mac, win, linux]) for (const s of steps) assert.ok(!s.args.some((a) => a.startsWith("chrome://")));
});

test("arguments", () => {
  assert.deepEqual(I.parseArgs([]), { dir: I.DEFAULT_DIR, open: true, help: false });
  assert.equal(I.parseArgs(["--dir", "~/x"]).dir, path.join(os.homedir(), "x"));
  assert.equal(I.parseArgs(["--no-open"]).open, false);
  assert.equal(I.parseArgs(["-h"]).help, true);
  assert.throws(() => I.parseArgs(["--dir"]), /需要一个路径/);
  assert.throws(() => I.parseArgs(["--bogus"]), /不认识的参数/);
});
