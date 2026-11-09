// Development server for trying the extension's scripts without installing it.
//   /                 the live hackertube.org page (its /api calls are proxied), with dev/load-site.js injected
//   /player           a stand-in for the YouTube embed (dev/player.html) to exercise subtitles
//   /preview/popup, /preview/options   the extension's own pages, running against the API shim
//   /ext/<path>       files of this extension
//   /media/<file>     files from the media directory (a test video for /player)
// hackertube.org's CSP blocks injected scripts and translation requests, hence the local mirror.
// Run: node dev/server.js [port] [mediaDir]   (default port 8787; mediaDir also via $HTZ_MEDIA_DIR)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = +process.argv[2] || +process.env.PORT || 8787;
const SITE = "https://hackertube.org";
const MEDIA = process.argv[3] || process.env.HTZ_MEDIA_DIR;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm" };

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("not found"); }
    const headers = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "Accept-Ranges": "bytes" };
    // byte ranges, so the test video in /player can be seeked
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m) {
      const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
      const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  });
}
const inside = (base, rel) => { const p = path.normalize(path.join(base, rel)); return p.startsWith(base + path.sep) ? p : null; };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (p.startsWith("/ext/")) {
      const f = inside(ROOT, p.slice(5));
      return f ? sendFile(req, res, f) : (res.writeHead(403), res.end());
    }
    if (p.startsWith("/media/") && MEDIA) {
      const f = inside(path.resolve(MEDIA), p.slice(7));
      return f ? sendFile(req, res, f) : (res.writeHead(403), res.end());
    }
    if (p === "/player") return sendFile(req, res, path.join(__dirname, "player.html"));
    // the popup and options pages, with the API shim and the real service worker logic loaded first
    const preview = /^\/preview\/(popup|options)$/.exec(p);
    if (preview) {
      const page = preview[1];
      const html = fs.readFileSync(path.join(ROOT, page, `${page}.html`), "utf8").replace("<head>",
        `<head><base href="/ext/${page}/"><script src="/ext/dev/chrome-shim.js"></script><script type="module">import "/ext/background.js";</script>`);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (p.startsWith("/api/")) {
      const r = await fetch(SITE + p + url.search);
      res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json" });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (p.includes(".")) { res.writeHead(404); return res.end(); }
    // any app route: the real page, plus our loader after the site's own script
    const html = await (await fetch(SITE + "/")).text();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html.replace("</body>", '<script src="/ext/dev/load-site.js"></script></body>'));
  } catch (e) {
    res.writeHead(502);
    res.end(String(e));
  }
}).listen(PORT, () => console.log(`HackerTube 中文 dev server on http://localhost:${PORT}`));
