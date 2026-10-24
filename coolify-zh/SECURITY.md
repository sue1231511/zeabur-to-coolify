# 汉化脚本的安全说明

用户脚本会在你的 Coolify 面板里运行，而 Coolify 面板能控制整台服务器。所以对这类脚本保持警惕是对的。这一页把脚本做了什么、没做什么写清楚，并告诉你怎么**自己验证**，不需要相信我们。

## 一句话

这个脚本只做一件事：把页面上的英文文字换成中文。它不联网、不读你的数据、不改你的设置。

## 它拿到了什么权限

```
// @grant        none
// @match        https://coolify.example.com/*
```

- `@grant none`：不向脚本管理器申请任何特殊能力。没有跨域请求、没有剪贴板、没有通知，和网页里普通的一段 JavaScript 能力相同。
- `@match`：只在你填写的那一个面板地址上运行，其他网站一概不碰。
- 没有 `@require`：不从网上加载任何别的代码。
- 没有 `@updateURL` / `@downloadURL`：不会自己联网检查更新。以后有新版本，由你手动替换。这样即使将来这个仓库被人篡改，已经装好的脚本也不会被悄悄换掉。

## 它读写了什么

| 动作 | 具体内容 |
|---|---|
| 读页面上的文字 | 只读，用来和内置的中英对照表比对 |
| 改页面上的文字 | 只改文字节点的内容，以及 `placeholder`、`title`、`aria-label` 这三个纯展示属性 |
| 浏览器存储 | 只用一个键 `coolifyZh.lang`，值只会是 `zh` 或 `en`，记住你选的语言 |
| 往页面里加东西 | 只加了右下角的切换按钮和它的一小段样式 |

**明确不碰的：**

- 输入框和文本框的**值**（你填的内容），一个字都不读不改；
- 任何元素的 `class`、`href`、`value`、事件；
- cookie、登录令牌、环境变量的值；
- 日志区、终端、代码编辑器（这些区域整片跳过，连翻译都不做）；
- 不点击任何按钮，不提交任何表单。

## 自己验证

不用信我们，直接搜代码。下载 `coolify-zh.user.js` 后，在文件里搜下面这些写法，**应该一个都搜不到**：

| 搜索 | 代表什么 |
|---|---|
| `fetch(` | 发网络请求 |
| `XMLHttpRequest` | 发网络请求 |
| `WebSocket` | 建立长连接 |
| `sendBeacon` | 偷偷发数据 |
| `.cookie` | 读 cookie |
| `eval(` 、`Function(` | 把字符串当代码执行 |
| `innerHTML` 、`outerHTML` 、`insertAdjacentHTML` 、`document.write` | 把字符串当 HTML 写进页面 |
| `import(` | 动态加载外部代码 |
| `.src =` 、`setAttribute('src'` 、`setAttribute('href'` | 让页面去加载某个地址 |
| `GM_` | 用脚本管理器的特殊能力 |

命令行：

```bash
# macOS / Linux
grep -n -E "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|\.cookie|eval\(|Function\(|innerHTML|outerHTML|insertAdjacentHTML|document\.write|GM_|import\(|\.src *=|setAttribute\(['\"](src|href)" coolify-zh.user.js

# Windows PowerShell
Select-String -Path coolify-zh.user.js -Pattern "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|\.cookie|eval\(|Function\(|innerHTML|outerHTML|insertAdjacentHTML|document\.write|GM_|import\(|\.src *=|setAttribute\(['""](src|href)"
```

没有输出就对了。

为什么要带括号搜：文件里一大半是中英对照表，里面有 Coolify 界面上的原句，比如 “Refetch”“Prefetch pages…”，直接搜 `fetch` 会搜到这些界面文字，它们只是要被翻译的字，不是代码。

至于网址：文件里出现的网址分两类。

- 代码和元信息里只有三个：`@namespace` 里本仓库的地址、`@match` 的占位地址，以及 SVG 图标用的命名空间 `http://www.w3.org/2000/svg`（这是 SVG 标准规定的固定写法，浏览器不会去访问它）。
- 其余的都在对照表的文字里，是 Coolify 界面提示原句中的示例地址，比如“填写实例的完整地址（例如 https://dashboard.example.com）”。它们只是被显示的文字。

也可以用浏览器开发者工具的“网络（Network）”面板观察：装上脚本前后，刷新 Coolify 页面，请求列表不会多出任何一条。

## 文件完整性

[README](README.md) 里贴了 `coolify-zh.user.js` 的 SHA-256。从 GitHub 下载后、改 `@match` 之前算一下，一致就说明和我们发布的是同一份文件。

## 我们自己怎么测的

发布前用无头浏览器跑过一组检查：中文翻译是否正确、切换英文能否完全还原、页面自己改文字后是否还原到最新的原文、日志区和代码区是否被跳过、输入框提示是否翻译、页面是否会因为脚本陷入反复改写等。

## 发现问题

如果你发现脚本有任何超出“换文字”的行为，或者有安全上的顾虑，请提 Issue。涉及具体漏洞细节的，请先不要公开写利用方法，在 Issue 里说明“有安全问题想私下沟通”即可。
