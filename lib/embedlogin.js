// "Play with my YouTube login": HackerTube embeds videos from youtube-nocookie.com, which never sees the user's
// youtube.com login cookies, so a network YouTube distrusts gets "Sign in to confirm you're not a bot" even after
// signing in. This declarativeNetRequest rule sends HackerTube's embed frames to www.youtube.com/embed instead
// (HackerTube's CSP allows that origin), where the login applies. The rest of the URL, including ?autoplay=1, is kept.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.HTZ = root.HTZ || {}).embedlogin = api;
})(globalThis, function () {
  const RULE_ID = 1;

  function rule() {
    return {
      id: RULE_ID,
      priority: 1,
      action: { type: "redirect", redirect: { regexSubstitution: "https://www.youtube.com/embed/\\1" } },
      condition: {
        regexFilter: "^https://www\\.youtube-nocookie\\.com/embed/(.*)$",
        resourceTypes: ["sub_frame"],
        // only frames that HackerTube itself loads (also matches www.hackertube.org)
        initiatorDomains: ["hackertube.org"],
      },
    };
  }

  // Add or remove the rule to match the setting. Dynamic rules persist across browser restarts and updates.
  async function sync(enabled, dnr = chrome.declarativeNetRequest) {
    await dnr.updateDynamicRules({ removeRuleIds: [RULE_ID], addRules: enabled ? [rule()] : [] });
  }

  return { RULE_ID, rule, sync };
});
