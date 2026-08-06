# 项目状态

更新时间：2026-08-06（Asia/Shanghai）

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
