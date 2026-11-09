// HackerTube's own interface strings (menus, filters, buttons, counts, dates), translated locally and instantly.
// Content written per video (titles, summaries, comments) goes through a translation engine instead.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.HTZ = root.HTZ || {}).uidict = api;
})(globalThis, function () {
  const EXACT = {
    // sidebar
    Home: "首页", Longs: "长视频", Liked: "赞过的视频", History: "历史记录", "Watch later": "稍后观看",
    Categories: "分类", Playlists: "播放列表", Settings: "设置",
    // filters
    Filters: "筛选", "Upload date": "上传日期", "Past year": "过去一年", Type: "类型", Duration: "时长",
    Features: "特色", "Sort by": "排序方式", Talk: "演讲", Lecture: "讲座", Explainer: "讲解", Tutorial: "教程",
    Documentary: "纪录片", Interview: "访谈", Demo: "演示", Commentary: "评论", Comedy: "喜剧", Music: "音乐",
    "Under 4 minutes": "4 分钟以内", "4–20 minutes": "4–20 分钟", "20–60 minutes": "20–60 分钟", "Over 1 hour": "1 小时以上",
    "Hidden gems": "冷门佳作", "Evergreen only": "仅常青内容", Relevance: "相关性", "Recently recommended": "最近推荐",
    "Oldest first": "最早优先", "View count": "观看次数", "Like ratio": "点赞率", "Most recommended": "推荐最多",
    "Best first": "最佳优先", "Play all on YouTube": "在 YouTube 上全部播放", "All videos": "全部视频",
    // pages and buttons
    "Liked videos": "赞过的视频", "Browse all videos": "浏览全部视频", "Clear all watch history": "清除全部观看记录",
    "Every video over an hour. The opposite of Shorts.": "所有超过一小时的视频。Shorts 的反面。",
    "Start here": "从这里开始", "Deep dives": "深入专题", "Broad, essential lists for your first visit.": "首次来访的入门必看清单。",
    "One obsession each, for when you want to go down a rabbit hole.": "每个专题一个主题，适合想深挖的时候。",
    "Coming soon.": "即将推出。", Like: "顶", Saved: "已保存", YouTube: "YouTube", "View on HN": "在 HN 查看",
    "Strongly recommends": "强烈推荐", Recommends: "推荐", Cites: "引用", Joke: "玩笑", Critical: "批评",
    "▶ this video": "▶ 本视频", link: "链接", Search: "搜索",
    "Loading…": "加载中…", "Searching…": "搜索中…", "Not found.": "未找到。", "Nothing here yet.": "这里还没有内容。",
    "No videos match these filters.": "没有符合这些筛选条件的视频。",
    "Lots of searches right now. Give it a minute and try again.": "当前搜索的人很多，请稍等一分钟再试。",
    "Videos you open will show up here.": "你打开过的视频会显示在这里。",
    "Videos you like will show up here, and shape your Home feed.": "你赞过的视频会显示在这里，并影响首页推荐。",
    "Save videos to watch later with the clock button on a thumbnail or on a video's page.": "用缩略图或视频页上的时钟按钮，把视频存到稍后观看。",
    // toasts and the shortcuts dialog
    "Prompt copied": "提示词已复制", "Added to Liked": "已加入赞过的视频", "Removed from Liked": "已从赞过的视频中移除",
    "Saved to Watch later": "已存到稍后观看", "Removed from Watch later": "已从稍后观看中移除",
    "Keyboard shortcuts": "键盘快捷键", "Next / previous video": "下一个 / 上一个视频", "Open the selected video": "打开选中的视频",
    "Like the selected or current video": "顶选中或当前的视频", "Watch later for the selected or current video": "将选中或当前视频存到稍后观看",
    "Play (on a video page)": "播放（视频页）", "Show these shortcuts": "显示快捷键", "Close / leave the search box": "关闭 / 离开搜索框",
    // about page stats
    videos: "个视频", "HN comments read": "条 HN 评论已读", "years of HN": "年的 HN",
  };

  // Words that appear as metadata tokens (content type, shelf life), shown lowercase on the video page.
  const TOKENS = {
    talk: "演讲", lecture: "讲座", explainer: "讲解", tutorial: "教程", documentary: "纪录片", interview: "访谈",
    demo: "演示", commentary: "评论", comedy: "喜剧", music: "音乐", other: "其他",
    evergreen: "常青", dated: "有时效", timely: "时效性", news: "新闻",
  };

  function views(num, unit) {
    const n = parseFloat(num) * ({ K: 1e3, M: 1e6, B: 1e9 }[unit] || 1);
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}亿次观看`;
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}万次观看`;
    return `${Math.round(n)}次观看`;
  }
  const AGO = { year: "年", month: "个月", week: "周", day: "天" };
  const hrmin = (s) => s.replace(/(\d+) hr/, "$1 小时").replace(/(\d+) min/, "$1 分钟");

  // One metadata piece such as "196K views", "7 years ago", "lecture".
  function piece(p) {
    let m;
    if ((m = /^([\d.]+)([KMB]?) views?$/.exec(p))) return views(m[1], m[2]);
    if ((m = /^(\d+) (year|month|week|day)s? ago$/.exec(p))) return `${m[1]} ${AGO[m[2]]}前`;
    if (p === "today") return "今天";
    if (TOKENS[p]) return TOKENS[p];
    if ((m = /^(\d+) videos?$/.exec(p))) return `${m[1]} 个视频`;
    if (/^(\d+ hr)?\s*(\d+ min)?$/.test(p) && /\d/.test(p)) return hrmin(p);
    if (p === "Curated by Claude") return "由 Claude 精选";
    return null;
  }

  const PATTERNS = [
    // "3 HN recommenders · recommended in 4 months, 2015–2023"
    [/^(\d+) HN recommenders? · recommended in (\d+) months?, (.+)$/, (m) => `${m[1]} 位 HN 用户推荐 · 在 ${m[2]} 个不同月份被推荐，${m[3]}`],
    [/^Cited (\d+)× on HN, (.+)$/, (m) => `在 HN 被引用 ${m[1]} 次，${m[2]}`],
    [/^(\d+) comments? from Hacker News$/, (m) => `来自 Hacker News 的 ${m[1]} 条评论`],
    [/^(\d{4}) · in “(.*)”$/, (m) => `${m[1]} · 发表于「${m[2]}」`],
    [/^Topic match · (.+)$/, (m) => `主题匹配 · ${m[1]}`],
    [/^topics in (\d+) areas$/, (m) => `个主题，分属 ${m[1]} 个领域`],
    [/^No videos match “(.*)” with these filters\.$/, (m) => `没有符合筛选条件的“${m[1]}”相关视频。`],
    [/^No strong matches for “(.*)”\. Here are the closest videos\.$/, (m) => `没有与“${m[1]}”高度匹配的视频，以下是最接近的结果。`],
    [/^Something went wrong \((.*)\)\.$/, (m) => `出错了（${m[1]}）。`],
  ];

  // Returns the Chinese for a whole UI string, or null when the string isn't one we know.
  function localize(text) {
    const t = text.trim();
    if (!t) return null;
    if (EXACT[t]) return EXACT[t];
    for (const [re, fn] of PATTERNS) { const m = re.exec(t); if (m) return fn(m); }
    // metadata lines joined by " • " or " · ": translate only if every piece is known
    const parts = t.split(/\s+([•·])\s+/);
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2) { out.push(` ${parts[i]} `); continue; }
      const z = piece(parts[i]);
      if (z == null) return null;
      out.push(z);
    }
    return out.join("");
  }

  return { localize, EXACT };
});
