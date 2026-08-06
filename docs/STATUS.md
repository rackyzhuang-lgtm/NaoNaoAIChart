# 项目状态

更新时间：2026-08-07（Asia/Shanghai）

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
