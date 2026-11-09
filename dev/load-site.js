// Injected by dev/server.js into the mirrored HackerTube page: same files, same order as the manifest.
(async () => {
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.append(s);
  });
  await load("/ext/dev/chrome-shim.js");
  await import("/ext/background.js");
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/ext/content/site.css";
  document.head.append(css);
  for (const f of ["lib/textutil.js", "lib/uidict.js", "lib/runtime.js", "content/site.js"]) await load(`/ext/${f}`);
  console.log("[HackerTube 中文] dev scripts loaded");
})();
