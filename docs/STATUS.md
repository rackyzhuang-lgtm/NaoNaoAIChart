# GitHub 分支推送（不触发打包，2026-08-10）

- 项目所有者明确要求推送代码但不触发打包。本轮未推送 `main`、未创建或推送 tag、未执行本地打包或 Release。
- `.github/workflows/desktop-packages.yml` 只监听 `main` 分支和 `v*` tag；为避开该触发条件，代码提交 `a4d9c2ea` 已推送到 GitHub 仓库 `racky77-coder/NaoNaoAIChart` 的 `codex/fix-single-chat-request` 分支。
- 原跟踪远程 `github`（`rackyzhuang/NaoNaoAIChart`）返回 `Repository not found`；已改用可访问且历史上用于发布的 `github-release` 远程。远程分支 SHA 已通过 `git ls-remote` 核对。
- GitHub Actions 在线运行列表未能查询：本机未安装 `gh`，匿名 GitHub API 达到共享 IP 限额；是否存在其他仓库级自动化只能以 GitHub 页面为准。根据仓库内当前工作流触发配置，本次普通功能分支 push 不匹配桌面打包条件。
- 推送前验证：定向 Vitest 5 个文件、56 个用例通过；Node 22 TypeScript、共享边界检查、变更范围 Biome（仅既有 warning）、`git diff --check` 和待提交秘密模式扫描通过。

# 固定网关聊天请求单次发送修复（2026-08-10）

- 已定位同一聊天请求可能重复发送的两层原因：renderer 请求工具默认允许 5 次重试，模型层还会对 429/5xx 状态自动重新提交。对于已经被服务端处理、但响应在中间链路延迟或失败的请求，这两层重试都会造成重复生成或重复计费风险。
- 固定 `https://naonaoai.shop/v1/*` 网关的聊天 POST 现在强制单次发送，即使调用方传入重试次数也不会重新调用主进程桥接；模型层也不再对该固定网关的 429/5xx 自动重新提交。
- 同一会话、同一用户消息 ID 的在途重复提交会直接复用第一次任务，不会在第一次结束后再次发送；不同消息继续由 `withSessionGenerationLock` 串行等待。模型列表等 GET 请求保留既有重试策略。
- 二次手工验收中，一条 `hi` 仍在 20:52:20 和 20:52:31 触发两次后台请求。现已在主进程最终出网边界增加相同 POST 指纹合并：在途相同请求共用一次 fetch，完成后 20 秒内相同请求复用第一次结果；请求体变化和窗口过期不受影响。日志只记录 SHA-256 指纹前缀，不记录凭证、提示词或响应内容。
- 验证：最终定向 Vitest 5 个文件、56 个用例通过；Node 22 TypeScript、共享边界检查、变更范围 Biome（仅既有 warning）和 `git diff --check` 均通过。
- 真实 Electron 窗口使用真实 API Key 的“后台仅收到一次请求”验收尚未执行；本轮未使用、读取或记录任何真实凭证，也未执行打包、推送或发布。

# 品牌知识库整理与归档（2026-08-10）

- 已更新 `docs/BRAND-INVENTORY.md`，将品牌主数据、Logo/图标资产、桌面/Web/移动端/无限画布消费位置、域名与外链、发布远程、Chatbox 遗留内容及系统标识迁移要求集中归档。
- 本轮特别补充了根包、发布包和发布锁文件中仍保留的上游作者、支持邮箱、主页和旧包名元数据，并将其标记为“用户可见或发布元数据待处理”，避免把 NaoNaoAI UI 品牌验收误认为发布包元数据也已完成替换。
- 当前品牌事实分层为：`NaoNaoAI Chat`（产品）、`NaoNaoAI Account`（账户）、`NaoNaoAI Agent`/`NaoNaoAI Canvas Agent`（无限画布 Agent）；`https://naonaoai.shop` 是固定模型/账户服务地址，`https://pay.ldxp.cn/shop/naonaoai` 是兑换码购买页，`https://eazyai.shop` 是 Canvas 第二可信服务源。
- 已明确 `xyz.chatboxapp.app`、`chatbox://`、`chatbox-dev://`、`chatbox:*` 本地键和 npm 包名属于安装/升级/数据兼容标识，不能按普通品牌文案直接替换；相关变更必须另立 ADR。
- 任务记录：`docs/tasks/0052-brand-knowledge-base.md`。
- 验证：品牌关键位置 `rg` 已执行；主 Logo 两份 PNG 的 SHA-256 一致；本轮 TypeScript、lint、单元测试、构建、打包和桌面 E2E 未执行，因为只更新 Markdown 知识库。

## 历史品牌资产盘点（2026-08-09）

- 已新增 `docs/BRAND-INVENTORY.md`，作为后续统一重品牌的基线，覆盖用户可见名称、Logo/图标资源、业务域名与外链、Chatbox 历史内容、应用 ID、深度链接协议和本地持久化键。
- 本轮明确区分普通显示文案与运行时标识：`naonaoai.shop` 是模型/面板网关及 Canvas allowlist，`xyz.chatboxapp.app`、`chatbox://` 和 `chatbox:*` 本地键会影响安装升级、协议链接和用户数据，均不能作为普通文本批量替换。
- 当前主 Logo 资源为 `assets/icon.png`、`assets/icon.ico`、`assets/icon.icns`、`assets/icon.svg` 及 `src/renderer/static/icon.png`；历史 `icon-chatbox.svg` 和 `chatbox-ai.png` 已记录为兼容资源，暂不删除。
- 已记录仍保留的 Chatbox Provider、远程域名、示例资源、支持邮箱、语言包和第三方请求头。是否移除旧 Provider 或替换第三方归因，待项目所有者明确决定。
- 本轮没有更改产品品牌、域名、后端地址、应用 ID、协议或业务代码；没有执行打包、发布或 Git 推送。
- 验证：关键位置 `rg` 复核已执行；`git diff --check` 通过。TypeScript、lint、单元测试、构建和桌面 E2E 未执行，因为本轮仅修改 Markdown 文档。

## 任务 0042：API 密钥入口导航（2026-08-09）

- “用于聊天”现在会保存所选 API Key 的 OpenAI-compatible Provider 配置，创建并切换到新聊天会话；会话明确使用绑定结果中的首个可用模型。
- “导入到无限画布”现在通过 TanStack Router 导航到 `/infinite-canvas`，保留待导入数据供画布读取，避免 `window.history.pushState` 在 Electron Hash Router 下只改变地址而不切换页面。
- 验证：定向 Vitest 1 个文件、5 项通过；变更文件 Biome 通过；锁定 Node 22 TypeScript 检查退出码 0；`git diff --check` 通过。
- 真实 Electron 窗口点击、设置弹窗关闭和最终页面手工验收未执行；未执行真实 API 请求、打包、发布和 Git 推送。任务记录：`docs/tasks/0042-api-key-entry-navigation.md`。

## 任务 0043：发布 v1.22.7（2026-08-09）

- 项目所有者已明确授权本轮执行推送、桌面安装包打包和 Release 发布。
- 发布版本从 `1.22.6` 递增为 `1.22.7`，目标标签为 `v1.22.7`，目标远程为已记录的 `github-release`。
- 发布前质量门禁、安装包构建、远程分支/标签推送和 GitHub Actions Release 结果待执行，未提前记录为成功。
- 任务记录：`docs/tasks/0043-release-v1.22.7.md`。

# 项目状态

## 测试启动清缓存与聊天模型获取修复（2026-08-10）

- 已定位并修复“用于聊天”后的新会话 Provider 不一致：绑定设置写入 `openai-responses`，但旧代码把新会话写为 `openai`，会绕过刚刚绑定的 sub2api 模型网关。新会话现在使用 `openai-responses` 和绑定返回的首个模型。
- 测试专用环境变量 `NAONAOAI_CLEAR_CACHES_ON_STARTUP=1` 会在 Electron ready 后清理 Chromium HTTP/cache storage、shader/service worker cache 及 `model-registry-cache-v2`；`pnpm start:clean` 固化这一开发测试启动方式。不清理配置、登录令牌、API Key、IndexedDB 聊天数据、知识库或附件数据。默认关闭，不影响普通启动。
- 桌面 renderer 到固定 `/v1/*` 网关的 IPC 请求以及主进程转发均强制 `Cache-Control: no-cache, no-store, max-age=0`，避免模型列表从任一缓存层读取旧数据。
- 验证：定向 Vitest 4 文件、38 用例通过；Node 22 TypeScript 通过；变更范围 Biome 通过；`git diff --check` 通过；生产构建通过（退出码 0，保留既有 chunk 循环依赖、chunk 体积和依赖 `eval` 警告）；带清缓存开关的开发 Electron 启动完成，renderer `http://localhost:1212/` 可用，测试进程已结束。本机已在启动前清理可重建缓存，并复核配置、IndexedDB、数据库仍保留。
- 全量 `pnpm test`：256 个测试文件、2481 个用例通过，3 个文件/61 个用例跳过，但 Vitest 报告一个 worker 意外退出的未处理错误并以退出码 1 结束，因此不记为通过。
- 本轮已使用 `pnpm start:clean` 启动本地测试客户端；renderer `http://localhost:1212/` 返回 HTTP 200，客户端保持运行供手工测试。未发起真实模型请求。
- 追加排查：手工失败日志显示主进程直连网关在 30 秒后中止已建立的 SSE 响应，导致服务端成功但客户端失败。现已将超时收窄到连接/响应头阶段，已建立流式响应允许完整读取；新增延迟 30 秒 SSE 回归测试通过。修复后客户端已重新启动并返回 HTTP 200，等待项目所有者重新发送消息验收。
- 真实 Electron 窗口点击“用于聊天”后的模型列表和真实 API Key `/v1/models` 请求未执行；未使用或记录真实凭证。

## 主聊天 Failed to fetch 修复（2026-08-09）

- 已定位主聊天与无限画布的网络差异：画布 Agent 在主进程请求固定模型网关，主聊天 renderer 直接跨源 `fetch`，在 Electron `webSecurity: true` 下失败并显示 `Failed to fetch`。
- 主聊天固定 `https://naonaoai.shop` `/v1` 请求现在复用主进程 loopback 代理；代理目标仍由现有 allowlist 严格限制，转发请求体、`Authorization`、SSE 响应和取消信号，不开放任意 URL。
- loopback 代理的 OPTIONS 和实际响应增加跨端口读取所需 CORS 头；未修改 Electron `webSecurity`、CSP 或 sub2api 服务端。
- 定向 Vitest：2 个文件、5 项通过；Node `v22.16.0` TypeScript：通过；变更范围 Biome：无 error（保留既有 warning）；`git diff --check`：通过。
- 直接访问固定网关 `/v1/models` 未携带 Key 返回 HTTP 401，网络可达；本地 Electron 重启后 renderer `http://localhost:1212/` 返回 HTTP 200，loopback 预检仅允许本地 Origin；真实模型请求和真实 Electron 窗口发送“你好”手工验收未执行。
- 本轮 `electron-vite build` 的 main/preload 阶段完成，renderer 阶段因既有生成 chunk 转译错误 `Expected ";" but found "\\b"` 失败，不能记录为生产构建通过。
- 任务记录：`docs/tasks/0039-main-chat-network-request.md`。

## 无限画布旧 preload 兼容修复（2026-08-09）

- 已定位用户反馈的“无限画布不可用”：运行中的旧 Electron preload 不含 `getInfiniteCanvasStoragePath`，但 renderer 已经热更新并调用该新接口，造成页面渲染报错 `TypeError: window.electronAPI.getInfiniteCanvasStoragePath is not a function`。
- 画布页面现先检测目录存储 IPC 能力。旧 preload 下不会调用缺失方法，保留既有画布 URL 加载流程，提示“本地存储目录功能需要重启软件后使用”并禁用目录选择；完整重启后加载新版 preload 可恢复目录功能。
- 本地启动调试时进一步发现目录能力辅助文件位于路由目录会被 TanStack 路由生成器误识别为页面，产生不存在的 `Route` 导入并阻断 renderer。已迁移至 `src/renderer/utils/` 并重建路由树；本地 NaoNaoAI Chat 开发窗口已启动，renderer `http://localhost:1213/` 返回 HTTP 200。
- Chat renderer 与 Infinite Canvas 已共享同一个 Chromium `sessionData`。为避免多个开发实例同时写入这份共享数据而触发 quota/IndexedDB `Internal error`，开发版现与安装版一样使用 Electron 单实例锁；需要并行调试必须使用独立用户数据目录，详见 ADR-0013。
- 已重启本地开发窗口并验证第二次开发协议启动请求被单实例锁拦截：探测进程退出码为 0，系统只保留一个可见的 NaoNaoAI Chat 窗口；会话维护和 `kb:list` 未再出现 quota/IndexedDB `Internal error`。真实模型发送未自动执行，避免使用实际 API 凭证。
- 定向 Vitest 2 个文件、4 项通过；变更范围 Biome 通过，0 error；运行中的画布 loopback 入口和 bundle 实测均返回 HTTP 200；`git diff --check` 通过。
- 真实 Electron 窗口重新进入画布及重启后的目录选择手工验收未执行，根生产构建状态仍按下文记录为未通过。

## 分组 preload 兼容修复（2026-08-09）

- 已确认 `getAvailableGroups` 的共享契约、主进程 handler 和新版 preload 均完整。用户遇到的 `api.getAvailableGroups is not a function` 来自正在运行的旧 preload，页面代码已先于 preload 热更新。
- 密钥创建/修改表单现在检测旧 preload 缺少方法的情况，向中文用户提示重启软件后重试，不再显示内部错误；应用重启后即可加载新版窄 IPC API。
- 定向 Vitest 2 个文件、8 项通过；变更范围 Biome 通过。真实 Electron 重启后的分组请求手工验收未执行。

## 无限画布本地存储修复（2026-08-09）

- 无限画布的本地存储统计已对 `navigator.storage.estimate()`、IndexedDB 打开、事务和游标读取失败做容错，失败时显示 0/空数据，不再把诊断统计失败升级为 `Internal error`。
- 无限画布页面增加“本地存储目录”和“选择目录”。主进程仅接受受信主窗口调用，保存绝对路径；下次启动在 Electron ready 前创建目录并设置 `sessionData`，界面明确提示“重启后生效”。该目录包含整个 renderer Chromium 会话数据，不自动迁移或删除旧目录数据，详见 ADR-0012。
- 画布静态 bundle 已重新生成，入口加载 NaoNaoAI 桥接脚本并指向新 bundle；旧 hash bundle 已按新 `dist` 精确移除。
- 定向 Vitest 2 文件、4 项通过；根 TypeScript 检查通过；变更范围 Biome 无 error（既有 warning 保留）；`git diff --check` 通过。画布独立 `typecheck` 仍受上游 `canvas-generation-helpers.ts:51` 的既有 `node.metadata` 可空错误阻塞。
- 真实 Electron 的目录选择、重启和数据落盘手工验收未执行。根 `pnpm run build` 在 Node 24 环境因 Windows `0xC0000005` 失败；以 `D:\software\nodejs\node.exe`（Node `v22.16.0`）直接运行 `electron-vite build` 时 main/preload 已完成，但在路由生成阶段未返回 renderer 完成信息或退出码，故根生产构建仍未记为通过。

## API Key 分组选择与列表精简（2026-08-09）

- 已依据上游普通用户路由接入 `GET /api/v1/groups/available`；创建和修改 API Key 均提交用户选择的 `group_id`。
- 新建和编辑统一为“密钥名称 -> 获取分组 -> 设置分组 -> 保存/修改”表单；列表只显示密钥名称、脱敏密钥及复制操作、`quota_used / quota` 用量，不显示状态列。
- 复制完整密钥由主进程受信 IPC 读取单个 Key 后直接写入系统剪贴板，完整密钥不返回 renderer；列表、创建和更新结果仍为脱敏摘要。
- 定向 Vitest 4 个文件、40 项通过；TypeScript 通过；生产构建通过；变更文件 Biome 无 error，保留既有 preload `any` warning；`git diff --check` 通过。
- 未执行真实账户创建、修改、删除或复制验证，未执行打包、推送或发布。

更新时间：2026-08-09（Asia/Shanghai）

## 账户精简、自动登录与品牌资源修正（2026-08-09）

- 登录页增加“启动应用时自动登录”选项。只有用户勾选后，主进程才使用 Electron `safeStorage` 加密 refresh token 并保存密文；启动阶段在主进程刷新会话，renderer 不接收 access token、refresh token 或密文。退出登录、刷新失败和安全存储不可用时会清除或不创建自动登录记录。
- 账户页、preload 和主进程受信 IPC 已移除用量明细、平台配额、模型广场和错误请求；相关请求不会从当前产品路径发起。趋势、模型用量摘要、订阅和其他未要求移除的账户功能保留。
- 兑换码模块增加“获取兑换码”，打开固定 `https://pay.ldxp.cn/shop/naonaoai` 的 sandbox iframe 弹窗。
- 简体中文语言包已覆盖“获取兑换码”“保持登录”，不会再对这两个账户控件回退显示英文。
- 经资源比对确认，旧 `src/renderer/static/icon.png` 是项目所有者截图中的橙色 Chatbox 图标；已用仓库 `assets/icon.png` 的 NaoNaoAI 猫脸轨道图标替换。Sidebar 与启动页继续共用该 renderer 资源。
- 本批定向 Vitest 7 文件、42 项通过；TypeScript 通过；变更文件 Biome 无新增 error（保留既有 warning）；生产构建和 Electron 开发启动烟测完成。真实账号自动登录重启恢复未执行，避免本轮使用或持久化实际凭证；开发启动存在既有 Chromium 缓存目录权限 warning。

更新时间：2026-08-08（Asia/Shanghai）

## 项目所有者最新要求（2026-08-08）

- 未经项目所有者明确要求，不执行 Git 推送、软件打包或 Release 发布；本轮未执行这些动作。
- 本轮已修复源码中的品牌入口：左上角和启动过渡动画均明确使用 NaoNaoAI `icon.png`；原 Chatbox 启动 SVG 已置于不可渲染模板。现有安装包未重新构建，桌面 E2E 未执行，因此不能据此宣称已安装软件包完成更新。
- 后续每项工作开始前必须先提供细分计划，计划必须包含功能测试和验收标准；未实际执行测试不得向项目所有者报告任务完成。
- 详细记录见 `docs/tasks/0028-owner-execution-and-branding-requirements.md`。

## 本轮 Logo 修复与验证（2026-08-08）

- `src/renderer/Sidebar.tsx` 的左上角 Logo 使用 `src/renderer/static/icon.png`，增加 `NaoNaoAI Chat logo` 标识。
- `src/renderer/index.html` 与 `src/renderer/index.ejs` 的启动过渡动画使用 NaoNaoAI `icon.png`；旧 Chatbox 内联 SVG 置于不可渲染的 `<template>` 节点。
- `logo192.png` 应用图标入口已改为 NaoNaoAI `icon.png`。
- 定向 Vitest 3 项通过；TypeScript 0 error；变更相关 Biome 检查通过；`git diff --check` 通过。
- 桌面 E2E 未执行，因为仓库脚本会先生成生产构建；本轮未执行构建、打包、推送或 Release 发布。

## 当前结论

- Chatbox Community Edition 基线已导入，保留完整可达历史；基线 SHA 为 `f90fc31afd634494bdf8f074eca3e38fcf8da740`。
- 导入提交为 `59d55feb`；第一批验证提交为 `1ec60fd2`。第二批工作分支为 `codex/batch-2-contract-login`。
- 第二批已完成 `NaoNaoAI Chat` 品牌基线、sub2api 契约、主进程登录会话 client 和窄业务 IPC；第三批已完成 Electron 安全边界和账户登录 UI。
- 项目所有者已于 2026-08-06 提供无可见水印的新 `logo.png`，Windows、macOS、Linux 和托盘图标资产已重新生成。
- 项目所有者已确认首发固定连接 `https://naonaoai.shop`；共享常量为 `SUB2API_BASE_URL`，当前不开放任意实例配置。
- 本地 `参考原项目源码/` 仅用于只读参考，已由 `.gitignore`、TypeScript 和 Biome 排除，不参与提交或推送。
- Chatbox + sub2api 的技术集成可行性仍为“高”；账户控制面与模型数据面的鉴权必须分离。
- 已对真实部署完成公共设置、普通用户登录、当前用户、refresh 轮换、logout 和 API Key 列表验证；实例返回 `run_mode=standard`。

## 第二批实现与验证

- 产品名、窗口标题、菜单、托盘、启动项和桌面构建图标已改为 `NaoNaoAI Chat`。
- 自动更新不再查询 Chatbox 上游 API，构建配置不再包含上游 publish bucket，发布脚本固定使用 `--publish never`；自有更新服务待配置。
- `src/shared/sub2api/` 提供 URL、运行时 schema、错误和 IPC 类型；所有地址由 `SUB2API_BASE_URL` 派生，URL 构造会拒绝跨 origin、反斜杠和路径逃逸。
- `src/main/sub2api/` 提供内存会话、登录/2FA/当前用户/logout、401 retry 与 refresh 单飞；凭证代际校验阻止旧请求覆盖或清理新登录会话。
- preload 新增固定业务方法；返回值不含 access token、refresh token 或 2FA temp token，用户 DTO 会剥离未建模字段。
- sub2api IPC 仅接受当前主窗口的受信 renderer，且不受信顶层导航会被阻止。
- 真实实例当前公开开关：注册开启；Turnstile、腾讯验证码、TOTP 和 backend mode 关闭。准确部署 commit 仍待确认。
- 测试账号已有 1 个 active API Key；已使用其只读验证 `/v1/models`，未暴露完整 Key。

| 项目 | 第二批结果 | 备注 |
| --- | --- | --- |
| `pnpm check` | 通过 | TypeScript 0 error |
| 新模块 Biome check | 通过 | 0 error、0 warning |
| `pnpm test` | 通过 | 230 files passed、2 skipped；2,411 tests passed、61 skipped |
| 固定实例 auth 流程 | 通过 | 登录、`/auth/me`、refresh 轮换、logout；未输出令牌 |
| 固定实例 API Key 列表 | 通过 | 返回 1 个 active Key 的掩码摘要；未创建或修改数据 |
| `/v1/models` | 通过 | 使用现有 Key 只读请求，返回 19 个模型 |
| `pnpm run build` | 通过 | main、preload、renderer 生产构建完成；保留上游 chunk warning |
| Windows x64/arm64 NSIS | 通过 | `NaoNaoAI Chat-1.22.1-Setup.exe`；开发验收包未签名 |
| 打包后 Electron 冒烟 | 通过 | `NaoNaoAI Chat.exe` 持续运行 20 秒，主进程与 3 个子进程存活后清理 |

当前安装包大小为 284,687,094 bytes，SHA-256 为 `7707A718514F7F76852A7980EA46D6713DCF9CBAB208B71E07D594671081ADF0`。该哈希仅对应本次未签名开发验收包，重新打包后必须重新计算。

## 第三批实现与验证

- `BrowserWindow` 已恢复 `webSecurity: true`，并显式启用 `contextIsolation`、关闭 `nodeIntegration`/`webviewTag`、启用 preload sandbox。
- preload 的兼容 `invoke` 现在经过 `src/shared/electron-ipc-channels.ts` 白名单；未知通道和 sub2api 通道不能通过通用入口调用。sub2api 继续只通过固定业务方法桥接。
- `openLink` 和新窗口外链只允许 HTTP(S)，不安全协议会被拒绝，不会交给系统浏览器。
- 新增 `/settings/account` 设置页，覆盖公共开关加载、登录、TOTP、已登录用户摘要、退出、会话过期和网络/服务错误重试。页面只接收用户 DTO，不接收令牌。
- 真实 Electron 开发启动在新安全配置下成功；公共设置验证返回注册开启、Turnstile/腾讯验证码/TOTP/backend mode 关闭；当前会话未登录；通用 sub2api IPC 调用被拒绝。
- 默认桌面与 390x844 浏览器预览无渲染 error、布局溢出或控件重叠；Web 预览明确显示账户服务仅在桌面应用可用。

| 项目 | 第三批结果 | 备注 |
| --- | --- | --- |
| TypeScript | 通过 | `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit`，0 error |
| 新增安全/账户测试 | 通过 | 3 files、11 tests passed |
| `electron-vite build` | 通过 | main、preload、renderer 构建完成；保留上游 chunk warning |
| 全量 Vitest | 基线失败 | 232 files passed、2 skipped；既有 `persist-artifact` Windows 路径断言 2 failures；2,421 tests passed、60 skipped |
| 本批 Biome | 通过 | 0 error；变更涉及的既有文件保留原有 warnings |
| 全仓 Biome | 通过 | 0 error、900 warnings；本批未新增 error |

全量 Vitest 的 2 个失败集中在 `src/main/sandbox/persist-artifact.test.ts`，独立重跑仍可复现，表现为 Windows `realpathSync.native` 短路径/长路径比较和缺失文件授权判断差异；未修改该无关模块。当前环境使用全局 Node `v22.16.0`，与历史记录中的被忽略 Node `v22.14.0` 不同，后续应在锁定工具链上复核。

## Git 与上游

## 第六批：移除 Chatbox 运行时网络与界面入口

- 已完成默认运行路径清理：不再自动请求 Chatbox 远程配置、版本、模型目录、遥测、引导、云端文件/链接解析、内置搜索、内置技能同步或内置 MCP 配置。
- 默认 Provider 和新会话模型改为 OpenAI-compatible 配置；内置搜索默认改为 Bing。旧 Chatbox enum/schema/migration 数据仍可读取，但旧 Provider、旧解析器和旧目录不会激活网络请求。
- 用户可见的设置、About、首页、错误提示、文件导出和加载页不再提供 Chatbox 登录、购买、FAQ、官网或试用入口。
- 保留边界：用户主动配置的 sub2api/OpenAI-compatible、第三方模型、MinerU、Bing、Tavily、BoCha、Querit 请求仍允许；上游兼容模块、旧组件和测试夹具可能保留字符串，但不在默认可达路径。
- 本批验证：直接 TypeScript 编译通过；最终定向 Vitest 及初始化/迁移回归测试通过；全量 Vitest 235 个文件、2,417 项测试通过、61 项跳过。仅有既有 Windows `src/main/sandbox/persist-artifact.test.ts` 的 2 项路径/realpath 断言失败，与本批改动无关。直接 `electron-vite` 生产构建和 `git diff --check` 通过，保留既有 eval、循环 chunk 和大 chunk 警告。

- `origin`：`git@gitee.com:ribbog77/nao-nao-aichart.git`
- `upstream-chatbox`：`https://github.com/chatboxai/chatbox.git`
- `upstream-sub2api`：`https://github.com/Wei-Shaw/sub2api.git`，仅用于接口变化比较，不合并其源码历史。
- 标签：`checkpoint/docs-bootstrap`、`baseline/chatbox-f90fc31`。
- 已于 2026-08-06 通过 SSH 将本地 `main` 首次推送至 `origin/main`，并建立上游跟踪关系；远程托管平台的仓库默认分支设置仍待确认。

## OpenAI Developer Docs MCP

- 全局配置中 `openaiDeveloperDocs` 已启用，地址为 `https://developers.openai.com/mcp`。
- `codex.cmd mcp list` 显示认证状态为 `Unsupported`；当前会话未暴露 `openaiDeveloperDocs` 搜索或抓取工具。
- 结论：配置存在，但当前会话不可调用。网络、地区、组织策略或客户端能力原因待确认；环境调整后需重启 Codex 再复查。

## 第一批验证结果

本机全局 Node `v24.18.0`、pnpm `11.9.0` 不满足上游约束。已在被忽略的 `.toolchain/` 中使用 Node `v22.14.0`、Corepack `0.31.0` 和 pnpm `10.33.0`。

| 项目 | 结果 | 备注 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 通过 | 安装 3,102 个包；使用 npm/Electron 镜像 |
| `pnpm run check` | 通过 | TypeScript 0 error |
| `pnpm run lint` | 通过 | Biome 0 error；保留 901 条上游 warning |
| `pnpm run test` | 通过 | 225 files passed、2 skipped；2,388 tests passed、61 skipped |
| `pnpm run build` | 通过 | main、preload、renderer 均构建成功；存在 chunk 警告 |
| Electron 开发启动冒烟 | 通过 | 进程持续运行 30 秒；随后已停止全部本项目 Node/Electron 进程 |
| `pnpm run test:e2e` | 不可执行 | 脚本引用的 `test/e2e/playwright.config.ts` 不存在，且未锁定 Playwright 依赖 |
| `pnpm run test:model-provider` | 未执行 | 需要显式启用真实模型 API，按项目约束不默认运行 |

## 第一批修复

- 排除本地参考源码目录，避免 TypeScript/Biome 扫描只读克隆。
- 修复上游基线中的 8 个 TypeScript error，不改变既有业务流程。
- 修复 13 个 Biome error；未进行全仓 warning 清理或格式化。
- 修复 Windows 路径分隔符断言、Unix 可执行位断言和迁移测试默认设置 mock。
- Windows 未开启开发者模式或未提权时无法创建目录符号链接；相关逃逸测试按能力跳过，基础授权目录测试仍执行并通过。

## 已知风险

- `epub@1.3.0` 的可选原生依赖 `zipfile@0.5.12` 未能构建 Windows 二进制；运行时会回退到 `adm-zip`，不阻塞构建，但 EPUB 解析性能可能较低。真实 EPUB 导入验收待执行。
- Biome 仍有 900 条上游 warning，当前不阻断构建；后续应按模块渐进治理，不做一次性扫仓。
- E2E 脚本缺少配置和依赖，不能声称桌面 E2E 已通过。
- 本批只在 Windows 验证；macOS、Linux 构建和启动仍待 CI 或对应环境验证。
- 当前 sub2api 会话只保存在主进程内存，应用重启后需要重新登录；安全持久化待三平台验证。
- 上游 preload 仍保留兼容性 `electronAPI.invoke`，但本批已加入显式通道白名单；高权限文件、沙箱、MCP 和 Skills handler 仍属于白名单内能力，后续应按模块迁移为 typed API。`webSecurity: false` 已移除，跨 Provider CORS 矩阵仍需持续验证。
- 本机缺少 symlink 权限，正式 exe 资源编辑所需的 `winCodeSign` 无法正常解压；开发验收包使用临时 CLI 覆盖跳过该步骤。正式 Windows 包仍需在 Developer Mode/提权构建机完成资源编辑和代码签名。

## 待确认

- 已部署 sub2api 的准确版本/commit；运行模式已确认是 `standard`。
- 是否允许使用现有测试 Key 发起真实聊天计费请求；秘密信息不得写入仓库。
- 首发是否开放注册，以及 OAuth、2FA、Passkey、支付的范围和外部浏览器策略。
- `origin` 的远程默认分支是否使用 `main`，以及何时允许首次推送。

## 下一步

第四批 API Key 与 Provider 绑定已完成：

- 已实现 Key CRUD、掩码列表、窄 IPC 绑定和 OpenAI Provider 设置写入；面板 JWT 与模型 API Key 保持分离。
- 定向测试 6 个文件、21 项通过；TypeScript 检查通过；变更文件 Biome 无 error。
- `corepack pnpm exec electron-vite build --mode production` 通过，main/preload/renderer 均生成生产产物。
- 全量 Vitest 为 234 个文件、2425 项通过、60 项跳过；`src/main/sandbox/persist-artifact.test.ts` 仍有 2 个 Windows 路径断言失败，未归因于本批改动。
- Electron 开发环境启动成功；账户页在 1280x800 和 390x844 本地浏览器视口无横向溢出，页面日志无 error。Web 预览按设计提示账户服务仅在桌面应用可用。
- 真实实例只读验证保留为登录、Key 列表和 `/v1/models`；未创建、修改或删除线上数据。完整 Key、测试账号密码未写入仓库或日志。

下一步：补齐锁定 Playwright 基础设施后再做桌面 E2E；在获得明确授权后，才进行测试 Key 创建和真实模型调用；跨平台构建与安全持久化仍待对应环境验证。

## 第五批：真实流式对话闭环契约

- 新增 `src/shared/providers/definitions/models/sub2api-streaming.test.ts`，通过合成 SSE 响应验证现有 OpenAI Provider 对固定 sub2api 地址的 POST URL、Bearer 鉴权、模型 ID、`stream=true`、文本 delta、finish reason 和 usage 适配。
- 新增 `test/integration/sub2api-streaming.test.ts`。真实请求仅在 `RUN_SUB2API_STREAM_TESTS=1` 且提供 `SUB2API_TEST_API_KEY`、`SUB2API_TEST_MODEL` 时运行；默认测试结果为 skipped，未触发网络或计费。
- 本批验证：离线流式测试 1 项通过；默认真实测试 1 项 skipped；`corepack pnpm check` 通过；相关 Biome 0 error/0 warning；`corepack pnpm exec electron-vite build --mode production` 通过。
- 构建保留既有依赖 `eval`、循环依赖和大 chunk 警告；未执行真实聊天请求，待明确费用授权后再做一次受控线上验证。

## 第七批：账户用量与订阅摘要

- 已完成 `/api/v1/usage/dashboard/stats` 与 `/api/v1/subscriptions/summary` 的 zod 契约、主进程 client、受信 IPC 和 preload typed API。
- 账户页已展示累计/今日请求、Token、实际扣费、有效订阅、到期时间和服务端提供的日/周/月窗口进度；两个摘要请求独立失败时不会清除登录状态。
- 已移除可达 API Key 操作中的 `Bind to Chatbox` 文案，替换为 `Use for chat`，并补充测试防回归。
- 定向测试 6 个文件、25 项通过；TypeScript 通过；变更文件 Biome 0 error，仅保留 preload 既有 `noExplicitAny` warning；生产构建通过，产物在 `release/app/dist`。
- 使用测试账号对固定实例执行只读契约验证：两个接口均 HTTP 200、`code=0`，字段名与本批 schema 一致；未输出账号数据、令牌或完整 API Key，未修改线上数据。
- 全量 Vitest 实际结果：227 个文件通过、3 个跳过；8 个套件因当前环境的 Electron 二进制下载失败无法加载，另有既有 Windows `src/main/sandbox/persist-artifact.test.ts` 的 2 项路径断言失败。不能据此宣称全量通过。

下一步：补齐 Electron/Playwright 的锁定验证环境后再做桌面 E2E；继续实现用量明细、趋势/模型分析前，保持只读范围，不进入支付或兑换码。

## 第八批：平台配额只读摘要

- 已完成 `/api/v1/user/platform-quotas` 的 zod 契约、主进程 client、受信 IPC 和 preload typed API。
- 账户摘要页已展示平台日/周/月额度、已用金额、重置时间，并区分无上限与禁用；空列表显示暂无平台配额配置，接口失败不会清除其他摘要。
- 定向测试 6 个文件、27 项通过；TypeScript 通过；变更文件 Biome 0 error，仅保留 preload 既有 `noExplicitAny` warning。
- 固定实例只读验证返回 HTTP 200、`code=0`、`platform_quotas` 为空；未修改线上配额、账户或模型数据。
- 生产构建通过，产物在 `release/app/dist`；保留既有 eval、循环依赖、旧 Browserslist 和大 chunk 警告。

下一步：实现用量明细、趋势和模型维度查询前，继续保持面板 JWT 只读边界；Electron/Playwright 锁定验证环境仍待补齐。

## 第九批：用量趋势与模型维度只读摘要

- 已接入 `/api/v1/usage/dashboard/trend?period=week` 和 `/api/v1/usage/dashboard/models?period=week` 的 zod 契约、主进程 client、受信 IPC 和 preload typed API。
- 账户摘要页已展示最近 7 天趋势和模型用量，空列表和两个接口独立失败均不会清除其他摘要。
- 固定实例只读验证两个接口均 HTTP 200、`code=0`，测试账号当前返回空数组；未修改线上数据。
- 定向测试 6 个文件、30 项通过；TypeScript 通过；变更文件 Biome 0 error，仅保留 preload 既有 warning。
- 生产构建完成，产物在 `release/app/dist`；保留既有 eval、循环依赖、旧 Browserslist 和大 chunk 警告。

下一步：实现分页用量明细和错误请求详情前，继续保持面板 JWT 只读边界；Electron/Playwright 锁定验证环境仍待补齐。

## 第十批：分页用量明细只读摘要

- 已接入 `/api/v1/usage?page=1&page_size=20` 的 zod 契约、主进程 client、受信 IPC 和 preload typed API；IPC 将页码限制为正整数且最多 1000，单页固定 20 条。
- 账户摘要页已展示日期、模型、请求类型、Token、实际扣费和耗时，支持分页、空列表和局部失败；不显示 API Key 原文或管理员字段。
- 固定实例只读验证返回 HTTP 200、`code=0`、空明细；未修改线上数据。
- 定向测试 6 个文件、32 项通过；TypeScript 通过；变更文件 Biome 0 error，仅保留 preload 既有 warning。
- 生产构建完成，产物在 `release/app/dist`；保留既有 eval、循环依赖、旧 Browserslist 和大 chunk 警告。

下一步：实现错误请求详情；随后处理兑换码、可用渠道/模型广场/公告和异常恢复体验。Electron/Playwright 锁定验证环境仍待补齐。

## 第十一批：错误请求列表与详情只读摘要

- 已接入 `/api/v1/usage/errors?page=1&page_size=20` 与 `/api/v1/usage/errors/:id` 的 zod 契约、主进程 client、受信 IPC 和 preload typed API。
- 账户摘要页已展示脱敏错误请求分页列表，包含时间、模型、分类、平台、状态码和消息；支持查看单条错误正文与上游状态码，覆盖空列表、详情失败和接口不可用状态。
- DTO 使用白名单 schema，未向 renderer 暴露 API Key 原文、管理员字段、上游账号或内部错误上下文；详情 ID 和页码均在 IPC/主进程校验。
- 固定实例只读验证列表接口返回 HTTP 403，说明服务端用户错误查看功能关闭；客户端稳定显示不可用提示，未修改服务端配置或线上数据。
- 定向 Vitest：6 个文件、34 项通过；TypeScript 通过；变更文件 Biome 0 error，仅保留 preload 既有 `noExplicitAny` warning。
- 生产构建 `corepack pnpm exec electron-vite build --mode production` 通过，产物在 `release/app/dist`；保留既有 eval、循环依赖、Browserslist 和大 chunk 警告。

第十一批完成时剩余 MVP 任务（5 项）：

1. 兑换码。
2. 可用渠道。
3. 模型广场。
4. 公告。
5. 会话过期、断网、限流和服务关闭的恢复体验。

下一步：继续实现兑换码或可用渠道等只读/普通用户能力；保持 sub2api 只通过面板 JWT 接入，并继续删除 Chatbox 相关网络调用和界面字眼。Electron/Playwright 锁定验证环境、跨平台构建和安全持久化仍待补齐。

## 第十二批：普通用户兑换码

- 已接入 `POST /api/v1/redeem` 与 `GET /api/v1/redeem/history` 的 zod 契约、主进程 client、受信 IPC 和 preload typed API；两类请求均使用面板 JWT。
- 账户页已增加兑换码输入、提交中/成功/失败状态、余额/并发结果和兑换历史；兑换成功后会刷新当前用户摘要与历史。
- 兑换码输入经过 trim、非空和最大 256 字符校验；历史接口返回的兑换码原文只在主进程短暂解析，IPC 转为 `code_hint`，同时剥离用户对象、管理员备注和其他未建模字段。
- 固定实例只读验证：登录后历史接口返回 HTTP 200、`code=0`，当前有 1 条记录且字段与 schema 一致；未输出记录值，未调用兑换 POST，未修改线上数据。
- 同批移除 macOS/Windows/Linux 桌面帮助菜单中的 Chatbox GitHub/Issues 网络入口；先进设置改为准确的诊断上报禁用状态，导出文件名改为 `naonaoai-exported-data-*`。
- 定向 Vitest：7 个文件、38 项通过；TypeScript 通过；变更文件 Biome 0 error，保留 preload 与先进设置既有 warning。
- 生产构建 `corepack pnpm exec electron-vite build --mode production` 通过，产物在 `release/app/dist`；保留既有 eval、循环依赖、Browserslist 和大 chunk 警告。

当前阶段剩余 MVP 任务（4 项）：

1. 可用渠道。
2. 模型广场。
3. 公告。
4. 会话过期、断网、限流和服务关闭的恢复体验。

下一步：实现可用渠道或公告等普通用户只读能力；继续清理可达路径中的 Chatbox 网络入口和界面字眼。Electron/Playwright 锁定验证环境、跨平台构建和安全持久化仍待补齐。

## 第十三批：普通用户可用渠道

- 已接入 `GET /api/v1/channel-monitors` 的 zod 契约、主进程 client、受信 IPC 和 preload typed API；只使用面板 JWT。
- 账户页已展示用户可见渠道的名称、平台、主模型、当前状态、主模型延迟和 7 日可用率，并支持刷新、空态和局部失败态。
- renderer DTO 使用白名单 schema，未包含令牌、管理员配置、上游账号或原始请求上下文；未实现任何渠道写操作。
- 同批删除主进程中遗留的 Chatbox 托管技能同步网络实现；内置技能同步固定使用随包种子且测试断言不调用 `fetch`，工具界面的 `Chatbox Version` 已改为 `App Version`。
- 固定实例只读验证：公开设置返回 `available_channels_enabled=false`、`channel_monitor_enabled=true`；渠道监控接口返回 HTTP 200、`code=0` 和 3 条记录。客户端明确提示渠道选择未开放，同时仍展示只读监控状态；未修改线上数据。
- 定向 Vitest 9 个文件、56 项通过；TypeScript、变更文件 Biome 和使用 8 GB Node 堆的生产构建通过。Biome 保留 preload 既有 `noExplicitAny` warning；默认堆重建曾在 renderer 分块阶段出现一次 V8 原生崩溃，8 GB 堆未复现；构建仍保留既有依赖 `eval`、循环分块、Browserslist 和大 chunk warning。

当前阶段剩余 MVP 任务（3 项）：

1. 模型广场。
2. 公告。
3. 会话过期、断网、限流和服务关闭的恢复体验。

下一步：实现模型广场或公告等普通用户只读能力；继续清理可达路径中的 Chatbox 网络入口和界面字眼。Electron/Playwright 锁定验证环境、跨平台构建和安全持久化仍待补齐。

## 第十四批：普通用户模型广场

- 已接入 `GET /api/v1/model-plaza` 的白名单 zod 契约、主进程面板 JWT client、受信 IPC 和 preload typed API。
- 账户页模型广场支持模型搜索、平台筛选、组倍率和 token/请求价格摘要；包含加载、失败、空结果和服务端关闭状态。
- 固定实例公开设置返回 `model_plaza_enabled=false`，接口返回 HTTP 404；客户端在关闭时不发起模型广场请求，未修改服务端或线上数据。
- 定向 Vitest 8 个文件、44 项通过；TypeScript 和变更文件 Biome 通过，保留 preload 既有 warning。8 GB Node 堆生产构建首次在 renderer 阶段瞬时退出，重试后完整通过；产物在 `release/app/dist`。

当前阶段剩余 MVP 任务（2 项）：

1. 公告。
2. 会话过期、断网、限流和服务关闭的恢复体验。

下一步：实现普通用户公告读取；随后统一完成会话过期、断网、限流和服务关闭的恢复体验。

## 第十五批：普通用户公告

- 已接入 `GET /api/v1/announcements` 与 `POST /api/v1/announcements/:id/read` 的白名单 zod 契约、主进程面板 JWT client、受信 IPC 和 preload typed API。
- 账户页已展示公告标题、正文、发布时间、已读状态和未读数，支持展开/收起、刷新与单条标记已读；列表加载和标记已读失败均为局部状态，不清除登录会话或其他账户数据。
- renderer 只接收白名单公告 DTO；未实现公告创建、编辑、删除、阅读统计或管理员能力。
- 同批将工具调用界面的 Chatbox 回退名称改为 `App Tool`，并修复模型广场/兑换码输入控件的翻译返回值类型与重复翻译键，恢复整仓 TypeScript/Biome 验收。
- 固定实例公告 GET 返回 HTTP 200、`code=0` 和 1 条记录，字段与契约一致；未调用标记已读 POST，未输出公告正文或用户数据。
- 定向 Vitest 9 个文件、61 项通过；TypeScript 与 `git diff --check` 通过；变更文件 Biome 0 error，仅保留 preload 既有 `noExplicitAny` warning。
- 使用 8 GB Node 堆的生产构建通过，产物在 `release/app/dist`；保留既有依赖 `eval`、循环分块、Browserslist 和大 chunk warning。

当前阶段剩余 MVP 任务（1 项）：

1. 会话过期、断网、限流和服务关闭的恢复体验。

## 第十六批：异常恢复与默认路径清理

- 已完成会话过期、网络断开、超时、HTTP 429、HTTP 403/404 和无效响应的主进程分类；refresh 失败会清理当前会话，IPC 仅传递白名单错误描述。
- 账户页已增加稳定的本地化恢复提示；会话失效回到登录表单，网络/超时/限流等局部失败保留当前用户和已加载模块。
- 默认可达路径不再发现或启用托管 MCP、产品技能、Chatbox Provider 或云文档解析；旧设置仍可读取但会映射到本地解析。未使用的网页解析调用已移除。首页场景、引导和评分弹窗不再显示旧品牌字样，设置根路由直接进入通用 Provider 页面。
- 定向 Vitest：7 个文件、54 项通过；TypeScript 通过；变更文件 Biome 无 error，保留仓库既有 warning；`git diff --check` 通过。
- 生产构建 `corepack pnpm exec electron-vite build --mode production` 通过，产物在 `release/app/dist`。E2E 仍不可执行，因为仓库缺少 Playwright 配置和锁定依赖。

当前阶段剩余 MVP 任务（0 项）。后续工作属于发布阶段：补齐 E2E 基础设施、跨平台构建矩阵和安全持久化验证。

## 第十七批：Windows 全量测试与桌面 E2E 基础设施

- 已恢复锁定的 Electron `35.7.5` Windows 运行时；本机手工恢复时产生的 `path.txt` 尾随换行已移除，Playwright 可正确解析 Electron 可执行路径。
- 已统一沙箱产物路径的 Windows 原生 realpath 语义，不存在的叶子路径会继承最近存在父目录的规范路径。
- 已锁定 Playwright `1.62.1`，补齐桌面 E2E 配置和品牌启动烟测；测试使用临时用户目录，不登录、不调用真实模型、不写线上 sub2api 数据。
- 已删除托管链接解析移除后遗留的不可达代码，当前链接预处理只进入本地解析路径；整仓 Biome 从 3 个 error 恢复为 0 error，保留 888 个既有 warning。
- `corepack pnpm test` 通过：242 个文件通过、3 个跳过；2,453 项通过、61 项跳过。既有 Electron 套件加载失败和 `persist-artifact` 的 2 个 Windows 路径失败均已消失。
- `corepack pnpm test:e2e` 通过：生产 main/preload/renderer 构建完成，1 项桌面烟测通过。构建保留既有依赖 `eval`、循环分块、Browserslist 数据过期和大 chunk warning。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵、安全持久化验证。

## 第二十批：GitHub Windows/macOS 安装包流水线

- 新增 `.github/workflows/desktop-packages.yml`，在 GitHub-hosted Windows/macOS runner 上执行质量门禁和 Electron 打包。
- Windows 产物上传为 `naonaoai-windows-installers`，macOS 产物上传为 `naonaoai-macos-installers`，Artifacts 保留 14 天；两者均固定 `--publish never`，不创建 GitHub Release。
- workflow 固定 Node.js `22.16.0`、pnpm `10.33.0`，并使用 npmmirror 的 npm、Electron 和 electron-builder binaries 镜像。
- 提交 `7273a111` 已推送到 GitHub `main`，并同步推送到 Gitee `main`。GitHub 首次运行和实际产物列表待仓库权限可见后确认；当前未配置签名、公证或任何秘密。
- GitHub API 在当前环境对该仓库返回 HTTP 404，无法读取私有仓库的 Actions 日志，未将远端构建写成通过。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（GitHub Windows/macOS 和 Gitee Linux 配置已完成，远端执行仍待确认）、安全持久化验证。

## 第二十一批：修复 GitHub Actions pnpm 版本冲突

- GitHub 首次运行在 `pnpm/action-setup` 步骤失败，原因是 workflow 的 `version: 10.33.0` 与 `package.json` 已锁定的带 SHA512 `packageManager` 被识别为两套版本。
- 已删除两个 job 中重复的 `version` 字段，保留 `package.json` 作为 pnpm 唯一版本来源；后续仍由 `pnpm/action-setup` 自动读取仓库锁定值。
- 本批尚未重新获得远端构建结果；修复后需重新运行 `Desktop packages` workflow 才能确认 Windows/macOS 制品。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（等待修复后的 GitHub/Gitee 远端执行确认）、安全持久化验证。

## 第二十二批：修复 CI 路由树生成顺序

- GitHub Actions 在干净 checkout 中先执行 `pnpm check`，但 `src/renderer/routeTree.gen.ts` 是被 `.gitignore` 忽略的 TanStack Router 生成文件，因此 TypeScript 报模块不存在，并连锁将所有路由路径推断为 `undefined`。
- 新增 `scripts/generate-route-tree.mjs`，复用锁定的 `@tanstack/router-generator` 配置生成路由树；`pnpm check` 现在会先执行 `pnpm run generate:routes`。
- 生成文件继续保持忽略，不提交机器生成产物。
- Dependabot 注释属于 GitHub 更新服务的独立错误；当前注释没有提供 updater 失败原因，详细日志需要仓库写权限才能查看，不能据此编造具体原因。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（等待本修复后的 GitHub/Gitee 远端执行确认）、安全持久化验证。

## 第二十三批：macOS 镜像修复与标签 Release

- GitHub Windows/macOS job 和两个 Actions artifacts 已成功；清除 Electron mirror 后，macOS 已从官方来源取得 DMG builder 并完成打包。
- macOS 打包 Bash 步骤已改为清除 `@electron/get` 优先读取的 Electron mirror/custom-dir 变量，调用同一 URL 解析函数断言 DMG builder 地址为 GitHub 官方来源，再直接通过 Node 启动 electron-builder CLI；Electron 本体同样改用官方 GitHub，npm 包继续使用 npmmirror。Windows 已通过的镜像配置保持不变。
- electron-builder 官方 `dmg-builder@1.2.0` Release 页面已确认包含失败日志所需的 arm64 bundle 和对应 x86_64 bundle；npmmirror 对该文件返回 404。
- workflow 新增标签 Release job：仅在 `v*` 标签运行，等待 Windows/macOS 成功，校验标签与 `release/app/package.json` 的打包版本一致，并使用 job 级 `contents: write` 创建 Release、上传 `.exe`、`.dmg` 和 `.zip`。
- 新增 ADR-0008 记录标签发布、权限、签名与自动更新边界。当前安装包仍未正式签名或公证，Release 不改变该事实。
- Release job 已通过标签校验并下载两个 artifacts，但多行 `find` 表达式被 shell 提前断行，导致资产数组为空；现已改成单行表达式，Release 创建和资产列表待再次移动未发布标签后确认。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（GitHub Windows/macOS 已确认，等待 Release 与 Gitee Linux 远端确认）、安全持久化验证。

## 第十八批：Gitee Go Linux 安装包流水线

- 新增 `.workflow/LinuxPackage.yml`，使用 Gitee Go 官方 YAML 1.0、`build@gcc` 暂存产物和 `publish@general_artifacts` 制品上传步骤。
- 流水线固定 Node.js `22.16.0` 和 pnpm `10.33.0`，在 Ubuntu 20.04 云构建环境中执行锁定安装、TypeScript、Biome、全量 Vitest、生产构建和 Linux x64 AppImage/deb 打包。
- 仅将安装包及 YAML/blockmap 元数据复制到 `artifacts/gitee/linux-x64`，并上传为默认制品库中的 `naonaoai-linux-x64`；electron-builder 继续固定 `--publish never`。
- 已将 Node.js、Corepack/pnpm、Electron 和 electron-builder binaries 下载固定到 npmmirror 镜像，降低 Gitee 云 runner 的默认海外源超时风险。
- 未加入账号、令牌、签名证书或 sub2api 数据；流水线不登录服务、不调用真实模型，也不向 Chatbox 上游发布。
- 本地 YAML 解析：通过；解析到 1 个 stage，包含 `build@gcc` 和 `publish@general_artifacts`。
- `corepack pnpm check`：通过，TypeScript 0 error。
- `corepack pnpm lint`：通过，0 error，保留 888 个既有 warning。
- `corepack pnpm test`：通过；242 个文件通过、3 个跳过，2,453 项通过、61 项跳过。
- `corepack pnpm run build`：通过；main、preload、renderer 生产构建完成，保留既有依赖 `eval`、循环分块、Browserslist 和大 chunk warning。
- `git diff --check`：通过。
- 本机 Windows 交叉执行 Linux x64 electron-builder 已进入解包阶段，但 Electron Linux 运行时下载长时间无进展后中止，未生成安装包；不代表 Gitee Go 远端执行结果。Gitee Go 首次远端执行只能在推送后确认，当前不得写成通过。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（已完成 Linux x64 配置，仍待首次远端执行及 Windows/macOS/Linux arm64）、安全持久化验证。

## 第十九批：README 产品文案清理

- 根 `README.md` 和 `doc/README-CN.md` 已改为 NaoNaoAI Chat 的产品范围、开发命令、Gitee 打包位置和许可证说明，删除旧品牌、官网、下载、推广和移动端入口。
- `team-sharing/README*.md` 已改为历史材料和不支持能力说明，避免继续宣传共享 API Key 服务。
- README 扫描只剩 `scripts/session-rag-eval/README.md` 的内部评测接口标识；环境变量、命令名和 fixture 路径与脚本实现绑定，本批未改名。
- `git diff --check`：通过。未改动业务代码，不重复运行全量代码测试。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵、安全持久化验证。

## 第二十四批：账户入口与启动品牌修复

- 启动画面 `src/renderer/index.html` 与 `src/renderer/index.ejs` 已改用 NaoNaoAI 图标和 `NaoNaoAI Chat` 产品名；上游 Chatbox 字标及启动背景不再可见。
- 桌面设置内存路由树已注册 `/settings/account`，账户路由补充可复用的 `RouteComponent`；桌面设置默认进入账户页，不再默认落到 Provider 页面。
- 主侧栏桌面端增加 `NaoNaoAI Account` 直达导航，移动端增加账户图标入口；账户页现有用量、渠道、模型广场、公告、兑换码和 API Key 功能均从该入口进入。
- 定向账户测试：2 个文件、7 项通过；账户服务暂时不可达时仍保留登录表单和重试入口；TypeScript 通过；变更文件 Biome 无 error（保留 `Settings.tsx` 既有 2 条 warning）；`git diff --check` 通过。
- 生产产物已重新构建并通过桌面 Playwright 烟测：1 项通过，实际点击主侧栏账户入口并打开账户页；未登录、未调用真实模型、未写入线上数据。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（远端执行确认）、安全持久化验证。

## 第二十五批：新 GitHub 仓库 Release 重试

- `main`、`.github/workflows/desktop-packages.yml` 和 `v1.22.2` 已确认推送到 `git@github.com:racky77-coder/NaoNaoAIChart.git`；项目所有者反馈新仓库没有 Actions 运行记录，Releases 页面仅有 GitHub 自动生成的源码压缩包，不能写成安装包发布成功。
- 当前环境可通过 SSH 推送新仓库，但 GitHub REST 对私有仓库返回 404，内置浏览会话未登录，本机也没有 `gh` CLI；仓库级 Actions 开关及远端日志状态待有 GitHub 网页权限的会话确认。
- 按项目所有者要求将应用版本递增到 `1.22.3`，用新提交和不可变的新标签重试远端工作流；不移动或覆盖已推送的 `v1.22.2`。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（等待新仓库远端执行确认）、安全持久化验证。

## Batch 030：准备发布 NaoNaoAI Chat v1.22.6

- 项目所有者已明确授权本轮执行推送、桌面打包和 Release 发布。
- `release/app/package.json` 已从 `1.22.5` 更新为 `1.22.6`，目标标签为 `v1.22.6`。
- `github-release` 远端已认证且当前为 `v1.22.5`；`v1.22.6` 尚不存在。
- Gitee `origin` 远端检查返回 SSH `Permission denied (publickey)`，本轮不能将 Gitee 推送写成成功。
- 锁定依赖解析完成；`release/app` 本机 postinstall 因缺少其本地 Electron 版本失败，随后使用 `--ignore-scripts` 完成依赖恢复。
- 单 worker 全量 Vitest：249 个测试文件中 246 个通过、3 个跳过；2524 项中 2463 项通过、61 项跳过。
- TypeScript 通过，0 error；全量 Biome lint 0 error、888 个既有 warning；变更文件 Biome check 和 `git diff --check` 通过。
- 生产 `electron-vite build` 通过；保留既有构建 warning。本地安装包打包按最新要求未执行。
- 提交 `6198edcb` 已推送到 `github-release/main`，`v1.22.6` 标签已推送且未移动既有标签。
- 按工作流触发规则，标签推送已触发 Windows/macOS 打包与 Release 流程；当前环境没有 `gh` CLI，GitHub API 返回 HTTP 403，远端安装包和 Release 资产尚未确认。
- Gitee `origin` 推送失败：SSH `Permission denied (publickey)`；未将其记录为成功。

## Batch 029：移除三个模型提供方的用户可见入口

- 已从模型提供方菜单、推荐列表、Provider Spotlight、设置页列表和已配置模型集合中移除 SiliconFlow、OpenRouter、Ollama。
- 新增共享 Provider 可见性规则；保留三个 Provider 的枚举、注册定义、模型实现及历史配置读取能力，避免旧配置损坏。
- 定向功能测试已执行：4 个测试文件、19 项通过，包含 Provider 可见性、品牌回归和旧配置迁移回归；未调用真实模型或写入线上数据。
- 本批不执行软件打包、Git 推送或 Release 发布。
- TypeScript：通过，0 error；Biome：通过，变更相关源码 0 error；`git diff --check`：通过。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（等待新仓库远端执行确认）、安全持久化验证。

## 第二十六批：修复账户 ContextBridge API

- 已复现“账户服务不可用”：固定服务公共设置接口和主进程 IPC 均成功，但账户页直接以 Electron `contextBridge` 只读对象作为 JavaScript `Proxy` target，并对不可配置方法返回新的包装函数，触发 Proxy 不变量 `TypeError`，请求尚未执行即进入错误状态。
- 错误处理代理现使用独立空对象作为 target，继续通过原始窄业务 API 调用主进程，不修改服务端、登录契约、凭证边界或 IPC sender 校验。
- 冻结 API 回归测试在修复前可稳定复现错误，修复后账户组件定向测试 6 项通过；TypeScript、变更文件 Biome 和生产构建通过。
- 真实 Electron 使用临时用户目录完成固定服务只读验证：公共设置返回版本 `0.1.171`，登录表单可见，页面不再显示“账户服务不可用”；未提交账号、未执行登录、未写入线上数据。
- 应用发布版本递增到 `1.22.4`，用于创建不可变的新标签并触发新仓库远端 Release。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（等待新仓库远端执行确认）、安全持久化验证。

## 第二十七批：按用户需求重新执行本地功能验收

- 已重新读取项目状态、范围、架构、路线图、上游说明及账户/站点对接相关任务与 ADR；固定服务、凭证分离、普通用户范围和去除 Chatbox 默认运行入口的边界未发生变化。
- 启动页源码静态验收通过：NaoNaoAI 图标与 `NaoNaoAI Chat` 产品名可见，旧启动字标保持隐藏；生产 Electron 窗口标题、首屏品牌和侧栏均未发现可见 `Chatbox AI` 字样。
- 固定服务公共设置只读请求成功，返回版本 `0.1.171`；真实 Electron 中账户入口、电子邮件/密码表单和登录按钮均可操作，未显示“账户服务不可用”，renderer 无 page error。
- 普通用户的用量、渠道监控、模型广场、公告、兑换码、API Key 和 Provider 绑定均在登录后的 NaoNaoAI 账户页；14 个相关测试文件、69 项定向测试通过。当前服务端渠道监控开启，但可用渠道和模型广场开关关闭，客户端不会将其伪装为可用。
- TypeScript 通过；Biome lint 为 0 error、888 个既有 warning；生产构建和锁定 Playwright 桌面烟测 1 项通过。
- 全量 Vitest 并发运行结果为 240 个文件通过、3 个跳过，2,453 项通过、61 项跳过；两个 Windows PowerShell Unicode 用例因并发编码环境失败，限制为单 worker 后对应 20 项全部通过。该问题不在账户或固定服务路径。
- 本轮未执行真实登录，因为工作区没有测试账号凭据；未调用真实模型、兑换、Key 写操作或公告已读写入，不能把登录后的线上数据写成已验证。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵（等待新仓库远端执行确认）、安全持久化验证。
## Batch 028: Remove Visible Chatbox Logo

- Replaced the onboarding card's legacy Chatbox logo with the bundled NaoNaoAI icon.
- Kept historical `chatbox-ai` provider IDs readable, but changed provider icon rendering to a neutral robot and blocked the legacy PNG lookup.
- Added focused provider icon regression tests: 3 tests passed.
- `corepack pnpm check`: passed. Changed-file Biome check: passed. `corepack pnpm run test:e2e`: passed (1 desktop smoke test).
- `git diff --check`: passed. No real account, token, API key, model request, or online data write was used.
- Release version is prepared as `1.22.5`; the tag must remain `v1.22.5` for the GitHub workflow's version check.

Remaining risk: legacy Chatbox compatibility modules and assets remain in the repository for migration/read compatibility, but are no longer selected by the updated visible rendering paths.

## 第三十一批：无限画布项目嵌入可行性评估

- 已只读复核 `basketikun/infinite-canvas` 的 GitHub 元数据、README、LICENSE、`web/package.json`、路由、画布状态存储、模型请求、WebDAV 和插件运行时代码；详细记录见 `docs/tasks/0031-infinite-canvas-feasibility.md`。
- 上游是私有 Vite SPA，不是可直接安装的画布组件；画布核心复用价值高，但原样合并会与当前 React 18/TanStack Router/Tailwind 3/MUI+Mantine 运行时冲突。
- 上游 renderer 直接持有并持久化 API Key，远程插件可访问页面数据；这不符合当前 Electron 主进程凭证边界，首发建议只移植画布核心并禁用插件/Agent/WebDAV。
- 结论：画布核心入口高可行；完整 SPA 原样嵌入中低可行；模型、插件和同步能力需拆分适配并分别验收。
- 本轮 `git diff --check` 通过；本仓库 TypeScript/lint/Vitest/构建/E2E 未执行（本轮无代码变更）；上游 Git clone 因 GitHub SSL 连接重置未执行，HTTP Raw/API 只读检查已执行。

当前 MVP 待执行任务（0 项）。发布阶段待执行任务（2 项）：跨平台构建矩阵、安全持久化验证。无限画布后续实施需先由项目所有者确认首发范围、窗口形态和 sub2api 图像/视频端点能力。

## 第三十二批：无限画布内嵌开发计划

- 已按项目所有者要求创建开发分支 `codex/infinite-canvas-embed`，基线为 `b67841ed745059a8b6e5141578ef5f83f764d971`。
- 已建立 `docs/tasks/0032-infinite-canvas-embed.md`，计划采用“固定上游 web 子项目 + Electron loopback 静态服务器 + renderer iframe 宿主”，不重写上游画布业务代码。
- 首期边界为菜单、宿主页、资源打包、生命周期和存储隔离；不注入 JWT/API Key，不默认启用远程插件、Agent/MCP、WebDAV 或视频/音频扩展。
- 本轮未执行上游安装/构建、应用 TypeScript/lint/Vitest、生产构建或桌面 E2E；仅完成分支和计划准备。

## 第三十三批：无限画布跨域请求要求

- 项目所有者新增要求：内嵌 Infinite Canvas 必须支持跨域请求。
- 已新增 Proposed ADR-0009：保持 Electron `webSecurity: true`，采用 loopback canvas origin + 固定 HTTPS allowlist/主进程受控代理；不使用通配符 CORS、任意代理 URL 或全局关闭同源策略。
- 跨域目标已明确限定为两个精确 origin：`https://naonaoai.shop`、`https://eazyai.shop`；不包含 HTTP、`www`、其他子域名、非默认端口或 IP 地址。
- `docs/tasks/0032-infinite-canvas-embed.md` 已增加跨域阶段、OPTIONS 预检、目标 URL 校验、SSRF/重定向阻断、日志脱敏和功能验收标准。
- 本轮未修改业务代码，未执行 CORS/代理实现、上游安装/构建、应用类型检查、lint、Vitest、生产构建或桌面 E2E；待固定 sub2api CORS 契约和第三方 provider 范围确认。

## 第三十四批：无限画布内嵌实现（进行中）

- 已固定上游 `v0.15.1` / commit `a2576d559ad765ba83e9563894adfbcd4e63405a`，源码位于 `vendor/infinite-canvas/`，MIT LICENSE 和独立 lockfile 保留；生产 web 产物位于 `assets/infinite-canvas/`。
- 已实现仅监听 `127.0.0.1` 的静态服务器、SPA fallback、MIME、路径 containment、生命周期关闭和单一 `infinite-canvas:get-url` IPC；iframe 只允许 loopback URL，preload 仅在主 frame 暴露。
- 已实现 `/infinite-canvas` 路由、侧栏入口、加载/错误/重试状态和 sandbox iframe；没有向 iframe 注入 JWT、refresh token 或 API Key。
- 已实现同源 loopback 代理：只映射 `https://naonaoai.shop`、`https://eazyai.shop`，拒绝其他域名、管理路径、非允许方法、重定向和任意代理目标；上游源码未改写，仅增加运行时 URL bridge。
- loopback 画布响应增加 `Content-Security-Policy`；bridge 拒绝非本地且非两条白名单服务的 fetch/XHR，使远程插件、Agent/WebDAV 默认不可用。
- 已执行：`corepack pnpm check` 通过（根 TypeScript 0 error）；无限画布/IPC 定向 Vitest 3 文件、6 项通过；`corepack pnpm run build` 通过；`git diff --check` 通过。
- 上游 `npm run typecheck` 仍因上游 `canvas-generation-helpers.ts:51` 的既有类型错误失败；上游生产构建在补齐 Windows 可选平台包后通过，保留动态导入和大 chunk warning。
- `corepack pnpm lint` 已执行，0 error、889 个 warning（其中 888 个为既有 warning）；全量 `pnpm test` 已执行但未通过：239 个文件通过、3 个跳过、9 个 Electron 依赖测试失败，原因是本机 Electron 二进制在前次中断安装后缺失。重装被无关的 `zipfile` ABI 下载 403 / 缺少 v140 工具集阻断。
- 尚未执行：锁定桌面 E2E、Windows 实际菜单点击/画布操作、macOS/Linux 构建矩阵；本轮未打包、推送或发布。

当前风险：需在真实 Electron 窗口验证 iframe 的 BrowserRouter 深链接、画布 IndexedDB 刷新恢复、代理真实 OPTIONS/流式响应和关闭释放端口；跨域代理未使用真实 API Key。
# Infinite Canvas Streaming Agent (2026-08-09)

- Branch: `codex/infinite-canvas-openai-agent`.
- Added an Electron main-process compatibility gateway for the embedded Infinite Canvas Agent. It calls only the OpenAI-compatible Chat Completions endpoint with `stream: true`, reassembles SSE text/tool-call chunks, and limits tool loops to eight rounds and 90 seconds.
- The upstream URL policy permits only `https://naonaoai.shop` and `https://eazyai.shop`; redirects and arbitrary origins are not accepted. The API key is held in main-process memory for the running session and is not returned through IPC, URL query strings, iframe storage, or gateway responses.
- Added a trusted-renderer host bridge: enabled Skills use a bounded `load_skill` result without absolute paths; running MCP tools use stable server-ID names, require Canvas opt-in, and require user confirmation for every call. Arbitrary command execution, Skill management, filesystem operations, MCP transport configuration, and raw MCP credentials remain unavailable to Canvas.
- Verification passed: focused Infinite Canvas tests (4 files / 6 tests), `corepack pnpm check`, lint of newly added gateway/host bridge files, and production build. Full lint completed with 889 existing warnings. Electron development startup and loopback server startup succeeded; the full interactive desktop smoke test remains unexecuted. The full test command showed no observed failing test output, but its final summary was truncated and is not recorded as a pass.

## Release 2026-08-09

- Main branch contains merge commit `26a2032c` (`feat: embed Infinite Canvas OpenAI agent`).
- `github-release/main` was pushed successfully to `26a2032c`.
- Push to the `github` remote failed with `Repository not found`; push to Gitee `origin` failed with SSH `Permission denied (publickey)`.
- `corepack pnpm run package` completed the application build but its NSIS stage hit a GitHub download timeout. The same `electron-builder --win --publish never` stage then completed successfully using the local Electron Builder NSIS caches. The build ran under Node `24.14.0` and pnpm `11.16.0`, outside the repository requirement of Node `>=22.13.0 <23` and pnpm `10.33.0`; a clean release rebuild under the pinned toolchain remains a risk.
- Windows installer: `release/build/NaoNaoAI Chat-1.22.6-Setup.exe`, 312,862,992 bytes, SHA-256 `922E3AC2325629E7E177328AF639582C51536D88F8124F3A34DEEE7D421BD9FA`.
- Blockmap: `release/build/NaoNaoAI Chat-1.22.6-Setup.exe.blockmap`, 325,292 bytes, SHA-256 `0DC47B5E8E69F8BF1C68A84F385C74C3859AC50395E2A236C24E02CF1F271B69`.
- The installer is unsigned (`signtool.exe` was invoked without a signing identity). macOS/Linux packages and a full interactive desktop smoke test were not executed in this release run.
- GitHub Release publication was not performed locally: the `gh` CLI is unavailable, and the canonical `github` remote is inaccessible. The repository workflow remains configured to create the cross-platform Release when a matching `v*` tag is pushed to an accessible GitHub repository.

## 任务 0040：右侧栏示例会话与右键删除（2026-08-09）

- 已将首次启动的中文默认会话收敛为截图中的 9 个示例：`Just chat`、`Markdown 101 (Example)`、`Software Developer (Example)`、`简单问候`、`Translator (Example)`、`翻译助手 (示例)`、`夸夸机 (示例)`、`小红书文案生成器 (示例)`、`做图表`；前三个保持置顶。
- 已将默认示例对话中的可见 `Chatbox` 品牌文案替换为 `NaoNaoAI Chat`，保留历史 ID、provider ID 和迁移模板兼容字段。
- 桌面会话项现支持右键打开菜单，菜单包含置顶、归档和永久删除；删除复用现有清理流程，删除当前会话后返回新会话入口。移动端长按菜单同步提供删除。
- 验证：定向 Vitest 2 个文件 / 8 个测试通过；Node 22 TypeScript 检查通过；变更范围 Biome 无 error；`git diff --check` 通过。
- 遗留：真实 Electron 右键菜单、删除确认和当前会话导航尚未手工执行；未执行打包、发布和真实模型请求。

## 菜单文案补充（2026-08-09）

- 侧栏两个 `Infinite Canvas` 用户可见入口已统一改为“无限画布”；路由和内部标识保持不变。
- 验证：`biome check src/renderer/Sidebar.tsx` 通过；`git diff --check` 通过。
# API Key 导入无限画布（2026-08-09）

- API Key 列表新增“导入到无限画布”入口；用户可选择文本模型、图片模型或视频模型类型。
- 主进程用所选 API Key 请求 `/v1/models`，将模型按选择的类型导入画布配置，并设置对应默认模型；面板 JWT/refresh token 不进入画布。
- 定向 Vitest 5 个文件、32 项通过；TypeScript、变更文件 Biome、桥接脚本语法检查和 `git diff --check` 已执行并通过。
- 真实账户线上导入、画布手工冒烟、多平台验证、打包和 Git 推送未执行。
# 无限画布内置 Agent 修复（2026-08-09）
- 已定位“Codex 对话初始化失败”的根因：画布仅连接 loopback 网关但未在加载前注入 NaoNaoAI Chat 文本模型配置，导致网关会话处于未配置状态。
- 已由 renderer 自动解析导入文本模型或当前默认 OpenAI-compatible 文本模型，并通过窄 IPC 配置主进程内置网关；用户不需要安装 Codex、CCSwitch、canvas-agent 或执行命令。
- 已移除 vendor 连接面板的外部插件、npx、Local URL 和 Connect token 引导，连接和初始化失败提示改为中文；网关运行时错误也已中文化。
- 已执行：定向 Agent/配置/静态服务器测试 9 项通过；vendor 构建并同步新 bundle；Node `v22.16.0` 根 TypeScript 检查通过。默认 Node `v24.14.0` 下 `pnpm check` 在 TypeScript 阶段发生 Windows `0xC0000005`，未将其报告为通过。真实凭证模型发送和真实 Electron 手工对话验收尚未执行，不能视为通过。
- 追加修复：发现现有用户配置只有 `providers.openai` 的地址、Key 和模型列表，没有设置全局 `defaultChatModel`；画布现在会从已配置的兼容 Provider 自动选择文本模型，并跳过 `codex-auto-review` 占位模型。
- 追加修复：首次画布连接现在以 `idle` 状态触发线程初始化；发送后立即同步线程 ID；停止请求缺少线程 ID 时也会中止当前网关流式请求，避免长期停留在“正在思考”。
- 追加修复：画布入口不再包含被 `script-src 'self'` 拒绝的内联主题脚本，主题初始化已移入同源桥接脚本；网关补齐 `GET /agent/codex/skills` 空列表响应，消除连接期间技能加载 404。
- 任务记录：`docs/tasks/0038-infinite-canvas-built-in-agent.md`；架构决策：`docs/decisions/0014-infinite-canvas-built-in-agent.md`。

## 发布 v1.22.7（2026-08-09）

- `release/app/package.json` 已更新为 `1.22.7`；本轮发布包含当前未提交的 NaoNaoAI 品牌、账户、API Key、无限画布、主聊天网络代理和 API Key 入口导航变更。
- 已在 Node `22.16.0` / pnpm `10.33.0` 下完成：`pnpm check`、`pnpm lint`（888 个既有 warning，无 error）、全量 `pnpm test`（255 个文件通过、3 个跳过；2489 项通过、61 项跳过）以及 `pnpm run build`。构建保留既有 eval、循环依赖、Browserslist 和大 chunk warning。
- `pnpm install --frozen-lockfile` 因 `zipfile@0.5.12` 原生模块缺少 VS2015/v140 工具失败；使用 `--ignore-scripts` 恢复依赖，并手动恢复 Electron 二进制后完成上述验证。该安装环境限制已记录，不能将普通安装报告为通过。
- Windows x64 NSIS 包已生成：`release/build/NaoNaoAI Chat-1.22.7-Setup.exe`，147,393,374 字节，SHA-256 `7AEE310A24A5FFB13B02A0462A42129F7C6490FE5C06E1A56711039EBE33A428`；blockmap SHA-256 为 `400501B7220DB4E9586417D6ACE27157B519CD2B0466F1424CF6B67146841455`。
- 首次 NSIS 下载 GitHub 资源超时；改用工作流同源 `npmmirror` 后打包成功。安装程序为未签名状态（`NotSigned`）。
- 发布提交 `ca8e4d4c9387582ec7acbec4b800924d3231ce38` 已推送至 `github-release/main`；带注释标签 `v1.22.7`（对象 `551747abc01acdf561a082eba7c758836dc8488e`）已推送并解析至同一提交，远程 ref 已复核。
- 标签推送已触发 GitHub Actions。当前环境没有 `gh`，对该仓库的未认证 GitHub API 查询返回 404，因此 Windows/macOS 远程打包和 GitHub Release 是否完成尚未确认，不能报告为成功。macOS/Linux 本地打包、桌面端交互 E2E、真实账户/模型请求均未执行。

## API Key 聊天模型同步修复（2026-08-10）

- 已定位 macOS/Windows 共用的模型同步风险：`/v1/models` GET 请求未显式禁止缓存，且“用于聊天”只更新 Provider 模型列表，没有更新全局默认聊天模型。
- `/v1/models` 现在使用 `cache: no-store` 和 `Cache-Control: no-cache, no-store, max-age=0`；绑定结果要求至少一个模型。
- “用于聊天”写入最新模型列表，并将首个模型同步为 `defaultChatModel`，后续新会话不再沿用旧的持久化默认模型。
- 定向 Vitest：4 个文件、40 项通过；全量测试：255 个文件通过、3 个跳过，2489 项通过、61 项跳过；Node 22 TypeScript 检查、相关 Biome 检查、生产构建和 `git diff --check` 均通过；`pnpm lint` 退出码 0，保留 888 个既有 warning。
- 真实 macOS/Windows Electron 窗口操作、真实账户和模型请求未执行，仍需手工验收模型列表及新会话默认模型。
- 任务记录：`docs/tasks/0044-api-key-model-sync-cache.md`。

## 账户注册（2026-08-10）

- 登录入口旁新增“注册”，通过主进程 IPC 调用 `https://naonaoai.shop` 的公开接口发送邮箱验证码并完成注册；注册成功后自动建立当前账户会话。
- 注册入口受服务端 `registration_enabled` 控制；邮箱验证、邮箱后缀白名单和验证码服务开关会同步到中文界面校验与提示。密码、验证码、access token 和 refresh token 不返回 renderer 或写入持久化存储。
- 已执行：定向注册测试、全量 Vitest（255 个文件通过、3 个跳过；2492 项通过、61 项跳过）、Node 22 TypeScript、相关 Biome、生产构建和 `git diff --check`；`pnpm lint` 退出码 0，保留既有 warning。
- 未执行：真实账号注册、macOS/Windows Electron 窗口手工注册验收、打包、Git 推送和 Release 发布。
- 任务记录：`docs/tasks/0045-account-registration.md`；架构决策：`docs/decisions/0015-sub2api-registration.md`。

## sub2api CORS 主进程直连桥接（2026-08-10）

- 已定位日志中的根因：`https://naonaoai.shop/v1/responses` 未返回 renderer 所需的 `Access-Control-Allow-Origin`，预检请求被浏览器拦截。
- renderer 现在通过受信任 IPC 交给主进程请求固定 `naonaoai.shop/v1/*`，主进程返回响应元数据和正文；不再发送 `/_naonao_proxy/...`，也未关闭 Electron webSecurity。
- 已执行：请求层 4 项、账户客户端/IPC 27 项、画布 Agent 5 项定向测试，Node 22 TypeScript、变更文件 Biome 和 `git diff --check`。真实线上模型请求未执行。
- 任务记录：`docs/tasks/0047-sub2api-cors-main-process-bridge.md`；架构决策：`docs/decisions/0017-sub2api-cors-main-process-bridge.md`。

## OpenAI Responses API 入站请求（2026-08-10）

- API Key“用于聊天”现在绑定内置 `openai-responses` Provider，默认聊天模型随之使用 `/v1/responses`，不再使用 `/v1/chat/completions`。
- NaoNaoAI renderer 请求现在直连 `https://naonaoai.shop/v1/responses`，不再改写为 `/_naonao_proxy/naonaoai.shop/...`；旧 OpenAI Chat Completions Provider 从用户可见列表隐藏，仅保留一个名为“OpenAI”的入口。
- 无限画布 Agent 也已改用 `/v1/responses`；请求使用 `input`、Responses 工具定义及 `store: false`，并解析文本、函数调用和用量的 Responses SSE 事件。
- 已执行：定向 Vitest（3 个文件、6 项通过）、Node 22 TypeScript、变更文件 Biome 和 `git diff --check`。未执行真实 API Key 的线上模型请求、桌面手工对话、打包、推送或发布。
- 任务记录：`docs/tasks/0046-openai-responses-api.md`；架构决策：`docs/decisions/0016-openai-responses-api.md`。

## 模型请求默认重试（2026-08-10）

- renderer 请求层默认改为 5 次重试；任何非正常响应或网络异常都会继续重试，连续失败后才抛出最后一次 API 错误。
- 模型 Provider 的 POST 请求不再默认单次执行，切换 API Key 分组后遇到短暂网关异常可以自动恢复；显式 `retry: 0` 的调用仍保持单次行为。
- 用户主动取消请求时立即结束，不会因重试再次发起请求；API 错误保留 HTTP 状态码。
- 已执行：定向 Vitest 2 个文件、7 项通过；Node 22 TypeScript 通过；变更文件 Biome 通过；`git diff --check` 通过。
- 真实线上模型请求、macOS/Windows Electron 手工验收、打包、Git 推送和 Release 发布未执行。
- 任务记录：`docs/tasks/0048-provider-request-retry.md`。

## React Avatar 控制台警告（2026-08-10）

- 已定位 `SystemAvatar` 将组件专用的 `sessionType` 透传到 Mantine Avatar，最终渲染为原生 `div` 属性并触发 React 警告。
- 已在 `src/renderer/components/common/Avatar.tsx` 拦截该属性，不改变头像展示和调用方接口。
- 已执行：Node 22 TypeScript、Avatar 文件 Biome 检查和 `git diff --check`，均通过。
- 本地开发窗口支持热更新；真实浏览器控制台刷新后的手工复核尚未执行。
- 任务记录：`docs/tasks/0049-react-session-type-prop-warning.md`。

## Codex 思考强度同步（2026-08-10）

- GPT-5 系列 OpenAI/OpenAI Responses 思考控件新增 `xhigh` 档位，简体中文显示“极高”，繁体中文显示“極高”；紧凑控件使用 4 个状态点区分该档位。
- 选择“极高”会持久化为 `openai.reasoningEffort: 'xhigh'`；OpenAI Responses SDK 最终映射为请求体 `reasoning.effort: 'xhigh'`。
- 非 OpenAI Provider、o-series 和 GPT-OSS 不显示或发送 `xhigh`；旧会话切换到不支持模型时回落为“默认”，避免携带无效参数。
- 已执行：定向 Vitest 4 个文件、62 项通过；Node 22 TypeScript、变更文件 Biome 和 `git diff --check` 通过。Biome 保留 `SessionSettings.tsx` 3 条既有 warning。
- Codex 官方手册抓取因 HTTP 403 未成功；OpenAI Developer Docs MCP 已注册但当前会话未加载。真实 API Key 线上请求、Electron 手工选择与重启持久化、打包、Git 推送和 Release 发布未执行。
- 任务记录：`docs/tasks/0050-codex-reasoning-effort-sync.md`。

## 无限画布 Agent 初始化卡死修复（2026-08-10）

- 根因：Agent 网关首次连接返回空会话 `idle` revision `1`，创建新会话仍返回 revision `1`；画布前端按 revision 丢弃 `ready` 状态，导致一直显示“正在初始化 NaoNaoAI Agent 对话”并禁用输入框。
- 修复：主进程网关为每次新建会话递增 conversation revision，并让 HTTP 响应与 SSE `workspace_changed` 事件使用同一 revision。
- 已执行：无限画布定向 Vitest 3 个文件、10 项通过；Node 22 TypeScript、变更文件 Biome 和 `git diff --check` 通过。
- Electron 手工验收：通过。进入无限画布并新建项目后，Agent 显示“工具列表加载完成，可以开始对话”，输入框已解除禁用。真实线上模型发送未执行。
- 任务记录：`docs/tasks/0051-infinite-canvas-agent-initialization.md`。
# EazyAI-Chat 功能同步到 NaoNaoAI（2026-08-13）

- 从只读目录 `D:\project\EazyAI-Chat` 按树差异迁入已选功能；源目录未写入。
- 保留 NaoNaoAI 品牌、Logo、`https://naonaoai.shop` 主服务、`https://pay.ldxp.cn/shop/naonaoai` 兑换地址、GPL-3.0 和现有发布元数据；`https://eazyai.shop` 仅作为画布次级可信来源及负向 URL 测试数据保留。
- `corepack pnpm install --frozen-lockfile`、`corepack pnpm check`、`corepack pnpm lint` 和 `git diff --check` 已执行；前三者/后者分别为通过、通过（911 条既有 warning）、通过。
- 高风险定向 Vitest 用例执行到结束且无断言失败，但 runner 因 worker 意外退出以退出码 1 结束，不能记为通过；全量 Vitest 仍未记为通过。
- 未执行：桌面 E2E、真实模型请求、打包、推送和 Release。
- 遗留风险：无限画布独立 typecheck 仍在 `vendor/infinite-canvas/web/src/lib/canvas/canvas-generation-helpers.ts:51` 报告 `node.metadata` 可能为 undefined；该问题未在本轮修改。
# 清理本地账号与缓存并启动测试客户端（2026-08-13）

- 已停止使用旧用户数据的读取路径，并将 `C:\Users\Administrator\AppData\Roaming\NaoNaoAI Chat` 旧目录移入隔离目录后删除；未修改 `D:\project\EazyAI-Chat`。
- 旧目录包含约 114 MB 的缓存、IndexedDB、聊天数据库、配置备份和本地凭证相关数据；隔离备份已删除，不再保留旧账号信息。
- 使用 `corepack pnpm start:clean` 启动全新 Electron 客户端，启动环境同时清理可重建 Chromium 缓存。
- 验证：renderer `http://localhost:1212/` 返回 HTTP 200，页面标题为 `NaoNaoAI Chat`；新 `config.json` 未发现 `sub2apiAutoLogin`、`authInfo`、`accessToken`、`refreshToken`、`apiKey` 或 `providers` 字段；Electron 进程仍在运行供手工测试。
- 未执行：账号登录、真实 API Key 请求、真实模型请求和桌面交互点击验收。

## 移除“关于”页 GitHub 入口（2026-08-13）

- 已移除“关于”页的 Github 图标、标题和代码仓库链接，同时删除仅供该入口使用的展示属性；NaoNaoAI 官网 `https://naonaoai.shop/` 和更新检查功能保持不变。
- 定向 Vitest 2 个文件、6 项通过；`corepack pnpm check`、生产构建和 `git diff --check` 通过。构建保留既有依赖 `eval`、循环分块、Browserslist 数据过期和大 chunk warning。
- renderer 返回 HTTP 200，Electron 客户端保持运行供手工验收；“关于”页实际点击复核未执行。
- 未修改 `D:\project\EazyAI-Chat`，未执行推送、打包、标签或 Release 发布。
- 任务记录：`docs/tasks/0055-remove-about-github.md`。

## NaoNaoAI Chat v1.22.9 发布准备（2026-08-13）

- 项目所有者已授权提交 GitHub 并打包 Release，且明确无需等待远程打包成功；版本已从 `1.22.8` 递增为 `1.22.9`，目标标签为 `v1.22.9`。
- 发布范围包含当前工作区的 EazyAI 功能同步、NaoNaoAI 品牌保留、“关于”页 GitHub 入口移除、相关测试/ADR 和重新生成的无限画布产物；未修改 `D:\project\EazyAI-Chat`。
- `corepack pnpm check` 和共享边界检查通过；Biome 退出码 0，0 error、911 条既有 warning；全量 Vitest 291 个文件、2,740 项通过，3 个文件/61 项跳过；生产构建通过；桌面 E2E 1 项通过。
- 首次全量 Vitest 因本机 `src/node_modules` junction 被误收集而失败；已将 Vitest 排除模式改为匹配任意层级的依赖/发布目录并增加回归测试，重跑后通过。
- 构建仍保留既有依赖 `eval`、循环分块、Browserslist 数据过期和大 chunk warning；未执行真实账户、真实 API Key 或真实模型请求。
- 发布提交 `73a86c71563a95c46afa44de7dec05a4a38697fd` 已推送到 GitHub `main`，`v1.22.9` 带注释标签已推送并满足 Release 工作流的 `v*` 触发条件。
- 按项目所有者要求未执行本地安装包打包，也不等待或轮询远程 Windows/macOS 打包结果；远程制品和 GitHub Release 当前未记录为成功。
- 任务记录：`docs/tasks/0056-release-v1.22.9.md`。

## 重新触发 v1.22.10 远程打包（2026-08-13）

- 项目所有者要求在新 GitHub 仓库 `rackyzhuang-lgtm/NaoNaoAIChart` 重新触发打包；已有 `v1.22.9` 标签不会重复触发标签工作流，因此准备新的 `v1.22.10` 标签。
- 本轮仅更新发布版本、提交并推送新标签；不运行本地测试、构建或安装包打包，也不等待远程 Windows/macOS 工作流结果。
- 任务记录：`docs/tasks/0057-retrigger-v1.22.10.md`。

## 继续同步 EazyAI-Chat v1.22.12 功能（2026-08-13）

- 已从只读目录 `D:\project\EazyAI-Chat` 的 `5b90a211..1fa072d3` 范围迁入无限画布 Agent 工具契约、输入校验、快照压缩、操作转换和网关注册；写操作继续通过现有画布确认事件执行。
- 账户页已按当前 NaoNaoAI 品牌拆分为“我的 / 公告 / 充值 / API 密钥”四个分区；侧栏已移除 `My Copilots`、`Help` 和 `/guide` 入口。源端 EazyAi 品牌、版本号、发布记录、`LICENSE` 及未跟踪测试未迁入。
- 已新增任务记录 `docs/tasks/0058-eazyai-chat-sync-continuation.md` 和 ADR-0031；源目录未修改，当前 NaoNaoAI 服务地址与发布远程未改变。
- 本轮已执行：`git diff --check`、品牌/路径静态检查。未执行：`pnpm test`、`pnpm build`、桌面 E2E、真实线上请求、打包和 Git 推送。
- 遗留风险：本轮未运行 TypeScript/lint，新增 Agent 工具文件和账户结构需在后续锁定环境中验证；无限画布上游既有 typecheck 风险仍存在。

## v1.22.11 远程 Release 触发（2026-08-13）

- 已将当前同步变更提交 `5764939c` 推送到 `github-build`（`rackyzhuang-lgtm/NaoNaoAIChart`）的 `main`，并推送带注释标签 `v1.22.11`。工作流要求标签与 `release/app/package.json` 版本一致，本次版本为 `1.22.11`。
- 本轮不执行本地测试、构建或安装包打包，也不等待远程 Windows/macOS 工作流完成；结果以远程 GitHub Actions/Release 页面为准。
- 任务记录：`docs/tasks/0059-release-v1.22.11.md`。

## v1.22.11 流水线失败与 v1.22.12 修复准备（2026-08-14）

- GitHub Actions 的 Windows/macOS 任务均在测试阶段失败，根因是 `Sub2ApiUsageSummary.test.tsx` 仍断言已移除的订阅摘要请求、`Pro plan` 和订阅失败提示；未进入桌面打包步骤。
- 已将测试更新为当前无订阅摘要的账户用量契约；定向 Vitest 结果为 1 个文件、2 项测试通过。首次带有 Jest 参数的命令失败属于命令参数错误，随后使用 Vitest 支持的单 worker 参数重跑通过。
- `release/app/package.json` 版本已更新为 `1.22.12`；修复提交 `db8efdcf` 已推送到 `main`，`v1.22.12` 标签已推送并重新触发远程 Release；未移动已有 `v1.22.11` 标签。
- 未执行本地生产构建、安装包打包或完整测试；源目录 `D:\project\EazyAI-Chat` 未修改。
- 任务记录：`docs/tasks/0060-fix-stale-usage-summary-tests.md`、`docs/tasks/0061-release-v1.22.12-after-test-fix.md`。

## v1.22.12 类型检查失败与 v1.22.13 修复准备（2026-08-14）

- `v1.22.12` 的 Windows/macOS 流水线在 TypeScript 检查阶段失败：`Sub2ApiUsageSummary.test.tsx` 的 API mock 删除了共享接口仍要求的 `getSubscriptionSummary()` 方法。
- 已补回不参与生产调用的类型 mock，并将发布版本提升为 `1.22.13`；已有 `v1.22.12` 标签不移动。
- `pnpm check` 和用量摘要定向测试已执行并通过；未执行本地生产构建、安装包打包或完整测试。
- 任务记录：`docs/tasks/0062-fix-usage-summary-api-mock-type.md`。

## v1.22.13 类型修复远程 Release（2026-08-14）

- 已将 `Sub2ApiUsageSummary` API mock 类型修复提交 `f33f31e2` 推送到 `github-build/main`，并推送 `v1.22.13` 标签；标签与 `release/app/package.json` 的 `1.22.13` 一致，已触发远程 Release 流水线。
- 已执行：定向 Vitest 2/2；较低堆上限的 TypeScript 检查通过；`git diff --check` 通过。标准 `pnpm check` 在本地 Node 进程以 Windows 访问冲突退出码 `3221225477` 结束，未发现 TypeScript 诊断，不能报告为标准命令通过。
- 未执行本地生产构建、安装包打包或完整测试；不等待远程流水线结果。源目录 `D:\project\EazyAI-Chat` 未修改。
- 任务记录：`docs/tasks/0063-release-v1.22.13-after-type-fix.md`。

## v1.22.13 PDF 测试超时与 v1.22.14 修复准备（2026-08-14）

- `v1.22.13` 的 Windows/macOS 流水线在完整 Vitest 阶段失败：`src/main/file-parser.test.ts` 首个 PDF 测试在 PDF.js worker 冷启动时超过默认 10 秒超时，未进入打包步骤。
- 已将 `parsePdf` 测试套件超时设置为 30 秒，不修改生产 PDF 解析逻辑；定向测试 6/6 通过。
- `release/app/package.json` 版本已更新为 `1.22.14`；修复提交 `7c21d0bd` 已推送到 `github-build/main`，`v1.22.14` 标签已推送并重新触发远程 Release；已有 `v1.22.13` 标签不移动。
- 未执行本地生产构建、安装包打包或完整测试；源目录 `D:\project\EazyAI-Chat` 未修改。
- 任务记录：`docs/tasks/0064-fix-pdf-parser-ci-timeout.md`、`docs/tasks/0065-release-v1.22.14-after-pdf-test-fix.md`。
