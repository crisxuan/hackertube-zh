<p align="center"><img src="icons/icon.svg" width="112" alt="HackerTube 中文助手"></p>

<h1 align="center">HackerTube 中文助手</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/hackertube-zh"><img src="https://img.shields.io/npm/v/hackertube-zh?color=ff6600" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

<p align="center"><code>npx hackertube-zh</code></p>

给 [HackerTube](https://hackertube.org)（Karpathy 做的“HN 推荐过的 YouTube 视频”站）用的 Chrome 扩展，把整个观看体验实时变成中文：

- **界面汉化**：菜单、筛选、按钮、观看次数、日期、HN 推荐信息等，本地词典即时替换，不走网络。
- **内容翻译**：视频标题、简介、“HN 为什么喜欢它”、HN 评论、分类名、播放列表介绍。滚动到哪翻到哪，译文以**双语对照**或**仅中文**方式渲染在原文位置，样式与原站一致。
- **实时中文字幕**：在 HackerTube 的嵌入播放器里显示中英双语（或仅中文）字幕，全屏也能看到，提前翻译当前播放位置往后 5 分钟。
- **中文搜索**：在搜索框输入中文，会先翻译成英文再交给 HackerTube 的语义搜索（它只理解英文）。
- **用 YouTube 登录状态播放**（可选）：解决嵌入播放器一直提示 “Sign in to confirm you're not a bot” 的问题，见下方“常见问题”。
- **三种翻译引擎**：Google 翻译（免费，默认）、Claude、任意 OpenAI 兼容接口（DeepSeek、通义千问、Ollama 等）。LLM 出错时自动临时回退到 Google。
- 所有译文缓存在本地，同一个视频、同一页再次打开不再请求翻译。

## 安装

需要 Node.js 18+ 和 Chrome 116+（Edge 等 Chromium 浏览器同样可用）。

```bash
npx hackertube-zh
```

它会把扩展放到 `~/hackertube-zh`，把 `chrome://extensions` 复制到剪贴板，并在 Finder 里选中这个文件夹。然后在 Chrome 里：

1. 地址栏粘贴 `chrome://extensions` 回车；
2. 打开右上角「开发者模式」；
3. 点「加载已解压的扩展程序」选择 `~/hackertube-zh`（或者直接把 Finder 里的文件夹拖到页面上）。

打开 <https://hackertube.org>，页面就是双语的了。点工具栏上橙色的「中」图标可以切换模式和引擎。

**更新**：再运行一次 `npx hackertube-zh`，然后在扩展卡片上点刷新按钮 ↻。可选参数：`--dir <路径>` 换安装位置，`--no-open` 只复制文件，`--help` 查看帮助。

为什么最后三步不能也自动化：Chrome 正式版会忽略命令行传入的 `chrome://` 地址，也不再支持用命令行参数加载扩展，加载未上架的扩展必须由用户自己打开开发者模式。要做到真正的一键安装，需要上架 Chrome 应用商店。

**从源码安装**：在 `chrome://extensions` 打开开发者模式，点「加载已解压的扩展程序」选择本目录。改代码后在扩展卡片上点刷新按钮，再刷新 HackerTube 页面。

## 使用

| 位置 | 作用 |
| --- | --- |
| 工具栏弹窗 | 网页翻译：双语对照 / 仅中文 / 关闭；视频字幕：中英双语 / 仅中文 / 关闭；字幕大小；用 YouTube 登录状态播放；翻译引擎 |
| 更多设置（选项页） | 引擎的 Key / 模型 / 接口地址，测试引擎，字幕离底部的距离，中文搜索开关，清空缓存 |
| 视频页 | 点播放后，播放器左上角会提示“中文字幕 · 已获取 N 句 / 翻译中 / 已就绪” |

### 翻译引擎

- **Google 翻译**：免费、零配置，需要网络能访问 `translate.googleapis.com`。个别标题 Google 会原样返回（它当成专有名词），这时不显示译文。
- **Claude**：在选项页填 API Key。默认模型 `claude-opus-5-5`，思考力度默认 `low`（翻译不需要深度推理，响应更快、思考开销更小）；想更省钱可以把模型换成 `claude-haiku-5-5`。字幕请求会带上视频标题和前几句作为上下文，自动生成字幕里没有标点的碎句也能翻得通顺。Key 只存在本机 `chrome.storage.local`，不会同步。
- **OpenAI 兼容接口**：填 Base URL 和模型名，例如 DeepSeek `https://api.deepseek.com/v1` + `deepseek-chat`，本地 Ollama `http://localhost:11434/v1` + 模型名。保存时浏览器会请求访问该地址的权限。

LLM 引擎按用量计费。字幕只翻译播放位置往后 5 分钟的内容，所以费用跟实际看了多少成正比，不会一打开视频就把整部翻完。

## 常见问题

**播放器提示 “Sign in to confirm you're not a bot”，在 YouTube 登录了还是看不了？**

两个原因叠在一起：

1. YouTube 怀疑你的网络环境（最常见的是代理 / VPN 节点，很多人共用同一个出口 IP），要求登录才能播放。
2. HackerTube 用 `youtube-nocookie.com`（隐私增强模式）嵌入视频，这个域名故意不使用 youtube.com 的登录 Cookie，所以你在 youtube.com 登录了，嵌入播放器里仍然是未登录状态。

解决办法（任选其一）：

- 在弹窗或选项页打开 **“用我的 YouTube 登录状态播放”**，然后刷新视频页。扩展会把 HackerTube 的嵌入改由 `www.youtube.com/embed` 播放（HackerTube 的安全策略本来就允许这个域名），能用上你已登录的账号，中文字幕照常显示。代价是观看会计入你的 YouTube 历史记录；还需要 Chrome 允许第三方 Cookie（设置 → 隐私和安全 → 第三方 Cookie，无痕窗口默认屏蔽）。
- 换一个不那么拥挤的代理节点。
- 点视频下方的「YouTube」按钮到 youtube.com 观看（中文字幕在那里不生效）。

这个开关只影响 HackerTube 页面里加载的播放器（用 declarativeNetRequest 规则，限定由 hackertube.org 发起的 iframe 请求），不影响其他网站。

## 工作原理

```
hackertube.org 页面                         YouTube 嵌入播放器（iframe, youtube-nocookie.com）
┌──────────────────────────────┐           ┌─────────────────────────────────────────────┐
│ content/site.js               │           │ content/player-main.js（页面主世界）         │
│  MutationObserver 监听 SPA 渲染 │           │  播放后通过播放器 API 打开英文字幕，            │
│  ├ 界面字符串 → lib/uidict.js   │           │  拦截播放器自己下载的 /api/timedtext 字幕文件   │
│  ├ 内容元素进入视口 → 批量翻译   │           │        │ postMessage                         │
│  └ 中文搜索词 → 英文再搜索       │           │ content/player.js（扩展隔离世界）             │
└──────────────┬───────────────┘           │  lib/subtitles.js 把字幕重组为句子             │
               │                           │  按播放进度分批翻译，叠加层渲染双语字幕          │
               │ chrome.runtime            └──────────────────────┬──────────────────────┘
               ▼                                                  │
        background.js（Service Worker）◄───────────────────────────┘
          缓存（内存 + storage.local）→ lib/engines.js：Google / Claude / OpenAI 兼容
```

几个关键设计：

- **为什么要拦截字幕而不是自己下载**：YouTube 的字幕接口现在要求播放器生成的 proof-of-origin 令牌，直接请求通常拿到空文件。所以扩展在嵌入页的主世界里调用播放器的 `loadModule('captions')` / `setOption('captions','track',…)` 打开英文字幕（优先人工字幕，其次自动生成），再复制播放器自己下载的那份。拿不到时会提示“点一下 CC 按钮重试”。
- **字幕重组**：自动生成字幕是逐词、无标点的；人工字幕常把一句话拆在两行。`lib/subtitles.js` 按标点、停顿和长度把它们重组成适合翻译和阅读的句子，并按字数比例分配时间。
- **只在 HackerTube 里生效**：嵌入播放器的脚本会检查 iframe 的上级页面是不是 hackertube.org，其他网站里的 YouTube 嵌入完全不受影响。
- **可完全还原**：网页翻译设为“关闭”时，所有替换的文字恢复原样，插入的译文全部移除。

## 隐私

- 被发送去翻译的只有：页面上的标题、简介、评论、分类名，字幕文本，以及你输入的中文搜索词。发送对象是你选的那个引擎。
- 不收集、不上传任何浏览记录；HackerTube 自己存在 localStorage 里的“赞过 / 历史 / 稍后观看”不会被读取。
- API Key 只存在本机。

## 已知限制

- 视频本身没有任何字幕（人工和自动生成都没有）时，无法生成中文字幕。
- 只处理 HackerTube 页面内的嵌入播放器；点“YouTube”按钮跳到 youtube.com 观看时不生效。
- YouTube 播放器接口不是公开 API，YouTube 改版后字幕获取可能需要调整（`content/player-main.js`）。

## 开发

项目没有构建步骤，也没有任何依赖。

```bash
npm test          # 单元测试：字幕解析与分句、引擎请求/响应、界面词典
npm run check     # 静态检查：manifest 引用的文件都存在、所有 JS 语法正确
npm run icons     # 从 icons/icon.svg、icon-small.svg 渲染 PNG 图标（用本机 Chrome 的无头模式）
npm run zip       # 打包到 dist/hackertube-zh.zip（上架 Chrome 应用商店用）
```

发布 npx 安装包（`bin/install.js` 是安装器，`package.json` 的 `files` 决定包里有什么，`npm run check` 会核对它覆盖了扩展用到的每个文件、版本号与 manifest 一致）：

```bash
npm publish                        # 之后任何人都能 npx hackertube-zh
```

不想发布到 npm 的话，推到 GitHub 后也可以用 `npx github:crisxuan/hackertube-zh`。发布前在本地试：`npm pack` 后运行 `npx --package=./hackertube-zh-<版本号>.tgz hackertube-zh --dir /tmp/htz-test --no-open`。

不安装扩展也能调试：`node dev/server.js 8787 <放测试视频的目录>` 启动开发服务器（HackerTube 的 CSP 禁止注入脚本，所以这里用本地镜像）：

- `http://localhost:8787/`：真实的 HackerTube 页面（`/api` 代理到 hackertube.org），注入了扩展的页面脚本和后台逻辑，`chrome.*` 由 `dev/chrome-shim.js` 模拟。控制台里可以用 `__htzDev.setSettings({ pageMode: 'zh' })` 切换设置。
- `http://localhost:8787/player`：模拟嵌入播放器，按钮发送自动生成 / 人工字幕，检查字幕叠加层、同步和样式。测试视频可以用 `ffmpeg -f lavfi -i testsrc=size=640x360:rate=24 -t 60 -pix_fmt yuv420p test.mp4` 生成。
- `http://localhost:8787/preview/popup`、`/preview/options`：弹窗和选项页。

```
manifest.json          扩展清单（MV3）
background.js          Service Worker：翻译调度、并发限制、缓存、引擎回退
lib/                   公共模块（浏览器和 node 测试共用）
  engines.js           Google / Claude / OpenAI 兼容引擎
  embedlogin.js        “用 YouTube 登录状态播放”的重定向规则
  subtitles.js         json3 / srv3 / WebVTT 解析与分句
  uidict.js            HackerTube 界面词典
  textutil.js          哈希、分批等小工具
  runtime.js           设置读写、消息通信
content/               内容脚本：site.*（HackerTube 页面）、player*（嵌入播放器）
popup/ options/ ui/    弹窗、选项页、公共样式
bin/install.js         npx 安装器
dev/                   本地调试服务器和模拟页面
tests/                 node:test 单元测试
scripts/               静态检查、图标渲染
icons/                 图标：icon.svg（大图）、icon-small.svg（16/32px 简化版）及渲染出的 PNG
```

## 参与贡献

欢迎提 Issue 和 Pull Request。提交前请跑一下 `npm test` 和 `npm run check`；改动行为时请补上对应的测试。HackerTube 或 YouTube 改版导致失效时，欢迎附上出问题的页面地址。

## 许可证

[MIT](LICENSE)。本项目与 HackerTube、Hacker News、YouTube 均无关联。
