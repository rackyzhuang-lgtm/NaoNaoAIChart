# 品牌知识库与标识清单

更新日期：2026-08-10
用途：记录 NaoNaoAI Chat 当前品牌事实、资产位置、域名边界和历史兼容内容，为下一次统一换品牌提供唯一的审查基线。

本文件只记录事实和迁移要求，不授权直接修改域名、应用 ID、协议、支付地址或兼容 Provider。代码事实优先于旧文档；本清单每次品牌变更后都要重新执行搜索和验收。

## 1. 品牌主数据

| 分类 | 当前值 | 主要位置 | 状态 |
| --- | --- | --- | --- |
| 桌面产品显示名 | `NaoNaoAI Chat` | `package.json`、`electron-builder.yml`、`src/main/main.ts`、`src/main/menu.ts`、`src/main/autoLauncher.ts`、`src/main/app-updater.ts` | 当前正式显示名 |
| Web/启动页显示名 | `NaoNaoAI Chat` | `src/renderer/index.html`、`src/renderer/index.ejs`、`src/renderer/index.web.ejs`、`src/renderer/modals/Welcome.tsx` | 当前正式显示名 |
| 账户子品牌 | `NaoNaoAI Account` | `src/renderer/Sidebar.tsx`、`src/renderer/routes/settings/route.tsx`、`src/renderer/components/settings/Sub2ApiAccountSettings.tsx`、三套核心语言包 | 当前正式子品牌 |
| 无限画布 Agent | `NaoNaoAI Agent`、`NaoNaoAI Canvas Agent` | `src/main/infinite-canvas/agent-gateway.ts`、`src/renderer/routes/infinite-canvas/index.tsx`、`src/renderer/components/infinite-canvas/CanvasAgentBroker.tsx` | 当前正式功能品牌 |
| 导出/示例名称 | `NaoNaoAI Chat` | `src/shared/utils/chat-export.ts`、`src/renderer/packages/initial_data.ts`、`src/renderer/lib/format-chat.tsx` | 当前正式用户内容 |
| 中文说明约定 | 简体中文优先，控件使用“获取兑换码”“保持登录”“无限画布”等中文 | `src/renderer/i18n/locales/zh-Hans/translation.json` | 当前产品沟通约定 |

不要把 `NaoNaoAI Chat`、`NaoNaoAI Account` 和 `NaoNaoAI Agent` 混成一个字符串替换任务；它们的显示场景、验收路径和未来命名规则不同。

## 2. Logo 与图标资产地图

当前主 Logo 为项目所有者提供的黑色线条猫脸图标。`assets/icon.png` 和 `src/renderer/static/icon.png` 的 SHA-256 均为 `54A669B41AE71793B233DF4515F6A51C96421E7C213E468EAE0DA8C0A5721D7E`。

### 桌面端

| 资产 | 消费位置 | 用途 | 换品牌要求 |
| --- | --- | --- | --- |
| `assets/icon.png` | `src/main/main.ts` | Linux 窗口/托盘通用图标，electron-builder 主资源 | 提供新品牌 PNG 母版并重新生成派生图标 |
| `assets/icon.ico` | `src/main/main.ts`、electron-builder 约定 | Windows 窗口/托盘及安装包图标 | 重新生成 Windows 多尺寸 ICO |
| `assets/icon.icns` | electron-builder 约定 | macOS 应用图标 | 重新生成 macOS ICNS |
| `assets/icon.svg`、`assets/icon-raw.png` | 无运行时直接引用 | 图标矢量/位图母版 | 保留生成来源，换品牌时一起归档 |
| `assets/icons/16x16.png` 至 `1024x1024.png` | electron-builder Linux 约定 | Linux 桌面图标集 | 从新品牌母版重新导出 |
| `assets/iconTemplate.png`、`assets/iconTemplate@2x.png` | `src/main/main.ts` | macOS 菜单栏模板图标 | 使用单色、透明背景的 macOS 模板图标 |
| `assets/installer.nsh` | NSIS 安装器 | 安装/卸载提示仍有 Chatbox 操作性文字 | 换品牌时人工复核，不做盲替换 |

### Renderer/Web 与移动端

| 资产 | 消费位置 | 用途 | 状态 |
| --- | --- | --- | --- |
| `src/renderer/static/icon.png` | `Sidebar.tsx`、`Welcome.tsx`、`about.tsx`、`index.html`、`index.ejs`、引导组件 | 侧栏 Logo、欢迎页、启动过渡页和 Apple touch icon | 与桌面主 Logo 同步 |
| `src/renderer/favicon.ico`、`src/renderer/static/favicon.png` | `src/renderer/index.html`、Web 构建 | 浏览器 favicon | 当前 favicon 来源需在换品牌构建后复核 |
| `resources/icon-foreground.png`、`icon-background.png`、`icon-only.png` | Capacitor 资源生成 | Android/iOS 应用图标 | 与桌面 Logo 独立，需重新生成 |
| `resources/splash.png`、`resources/splash-dark.png` | Capacitor 资源生成 | Android/iOS 启动屏 | 换品牌时同步替换并验收亮/暗主题 |
| `icons/icon-*.webp` | Web/移动端静态资源 | 各尺寸 Web 图标 | 需确认构建入口后再替换 |

### 无限画布

`assets/infinite-canvas/logo.svg`、`vendor/infinite-canvas/web/public/logo.svg` 和 `vendor/infinite-canvas/docs/public/logo.svg` 属于无限画布嵌入项目/上游资源，不等同于桌面应用主 Logo。替换前必须确认是否允许修改 vendor 资产；NaoNaoAI 桥接文件 `assets/infinite-canvas/naonao-embed-bridge.js` 是本项目运行时入口，应单独记录版本和 CSP 验收。

历史资源 `src/renderer/static/icons/icon-chatbox.svg` 与 `src/renderer/static/icons/providers/chatbox-ai.png` 暂不删除。它们可能被旧会话、Provider 配置或迁移代码读取，必须先完成兼容性决策和回归测试。

## 3. 域名、外链与服务边界

| 地址 | 代码位置 | 业务含义 | 换品牌风险 |
| --- | --- | --- | --- |
| `https://naonaoai.shop` | `src/shared/constants.ts`、`src/shared/sub2api/url.ts` | 固定账户面板和 `/v1` 模型网关 | 不是文案；需服务端迁移、代理 allowlist、CORS 和 API 测试 |
| `https://naonaoai.shop` | `src/renderer/utils/request.ts`、`src/main/infinite-canvas/policy.ts` | 主聊天主进程代理和 Canvas 允许的模型源 | 不能直接替换为任意 URL，需复核 SSRF、SSE、取消和重试 |
| `https://eazyai.shop` | `src/main/infinite-canvas/policy.ts`、`assets/infinite-canvas/naonao-embed-bridge.js` | Canvas 第二可信服务源 | 需服务端授权和 Canvas 回归后才能变更 |
| `https://pay.ldxp.cn/shop/naonaoai` | `src/renderer/components/settings/Sub2ApiRedeem.tsx` | “获取兑换码”内嵌购买页 | 属于支付外链，必须取得新地址授权并测试 iframe/CSP |
| `https://gitee.com/ribbog77/nao-nao-aichart` | `package.json`、About 页、`docs/UPSTREAM.md` | 公开代码仓库/项目信息 | 仓库迁移需同步 About、发布脚本和许可证说明 |
| `https://github.com/racky77-coder/NaoNaoAIChart.git` | Git remote `github-release` | GitHub 打包与 Release 远程 | 发布身份，不等同于用户官网 |

此外仍存在 Chatbox 上游地址：`api.chatboxai.app`、`chatboxai.app`、`api.ai-chatbox.com`、`api.chatboxapp.xyz`、`static.chatboxai.app`、`download.chatboxai.app`、`beta.chatboxai.app`。这些必须按下节分类处理，不能把“搜索到域名”误判为默认运行时依赖。

## 4. Chatbox 遗留内容分层

### A. 用户可见或发布元数据，换品牌前必须处理或确认

- `release/app/package.json` 的作者、邮箱和主页仍为 `Mediocre Company`、`hi@chatboxai.com`、`https://github.com/chatboxai`，会进入安装包元数据。
- 根 `package.json` 的作者仍为 `bennhuang` / `tohuangbin@gmail.com`；`release/app/package-lock.json` 仍使用 `xyz.chatboxapp.app`。这些上游元数据与当前产品品牌不一致，需在正式品牌迁移时统一确认，而不是自行猜测新主体。
- `assets/installer.nsh` 的安装器注释和部分提示仍称 Chatbox；需确认最终安装器是否会展示这些字符串。
- `src/renderer/routes/guide/`、多语言包、`src/renderer/routes/guide/-hooks/useGuideSession.ts` 仍有 Chatbox/Chatbox AI 教程、支持邮箱和外链。
- `src/renderer/packages/initial_data.ts` 仍使用 `static.chatboxai.app` 和 `download.chatboxai.app` 示例图片/头像，虽然示例文案已部分改为 NaoNaoAI。
- `src/shared/models/errors.ts`、`ChatboxAIErrorMessage.tsx` 和 Storybook 示例仍可能显示旧支持邮箱、主页或 Chatbox AI 服务描述。

### B. 运行时兼容或历史数据，禁止普通批量替换

- 旧 `Chatbox AI` Provider：`src/shared/providers/definitions/chatboxai.ts`、`src/renderer/routes/settings/provider/chatbox-ai/`、相关模型目录和测试。
- 旧许可证/上报/远程能力：`src/shared/services/native-license.ts`、`src/shared/services/native-report.ts`、`src/renderer/packages/remote.ts`、`src/main/skills/builtin/chatbox-product-info.ts`。
- `src/renderer/setup/protect.ts` 中的编码字符串和 `src/shared/request/chatboxai_pool.ts` 中的域名池，需先判断是否仍可达或仅为历史兼容。
- 备份格式、数据库名、MCP 客户端名、CLI 命令和 CSS token 中的 `chatbox` 属于技术兼容标识；改变前要设计迁移和回滚。

### C. 第三方归因，不按界面品牌直接修改

`src/shared/providers/definitions/models/openrouter.ts`、`custom-openai.ts`、`openai.ts`、`openai-responses.ts`、`custom-openai-responses.ts` 仍含 `HTTP-Referer: https://chatboxai.app`、`X-Title: Chatbox AI` 等请求头。它们代表第三方平台归因或服务策略，必须根据平台要求单独确认。

## 5. 安装、协议和本地数据标识

| 标识 | 位置 | 说明 | 迁移要求 |
| --- | --- | --- | --- |
| npm 包名 `xyz.chatboxapp.ce` | `package.json`、`release/app/package.json`、锁文件 | 构建和工具识别名 | 变更需评估依赖、升级和发布流程 |
| Electron appId `xyz.chatboxapp.app` | `electron-builder.yml` | 安装覆盖、系统数据目录和升级识别 | 必须另立 ADR，设计旧目录迁移 |
| `chatbox://`、`chatbox-dev://` | `src/main/main.ts`、`src/main/deeplinks.ts`、移动平台适配 | Provider 导入和登录回调 | 至少兼容读取旧协议一版 |
| `chatbox:first-successful-chat:v1` | `src/renderer/stores/firstSuccessfulChat.ts` | 首次成功对话状态 | 新键写入、旧键兼容读取 |
| `chatbox:lastArchiveSessionTipAt` | `src/renderer/components/session/SessionItem.tsx` | 归档提示状态 | 新键写入、旧键兼容读取 |
| `naonaoai:last-canvas-import` | `assets/infinite-canvas/naonao-embed-bridge.js` | 无限画布导入标记 | 新品牌应兼容读取旧键至少一个版本 |

## 6. 替换执行顺序与验收矩阵

1. **品牌资料确认**：全称、简称、中英文大小写、账户/Agent 命名、Logo 套件、支持邮箱、官网、支付页、法律链接。
2. **用户可见层**：窗口标题、托盘、菜单、侧栏、欢迎页、启动页、favicon、示例会话、安装器提示和 About 页。
3. **服务与外链层**：模型网关、账户面板、Canvas allowlist、兑换码购买页、仓库和发布地址；逐项确认服务端已切换。
4. **系统标识层**：appId、npm 包名、深度链接、本地存储键；新增 ADR，实施兼容读取和升级覆盖测试。
5. **兼容清理层**：旧 Provider、旧教程、旧资源和旧支持邮箱；按功能开关和迁移策略分批清理。

每次换品牌至少验收：

- 冷启动、启动过渡页、窗口标题、侧栏 Logo、托盘和安装器均显示新品牌。
- 新会话、账户页、无限画布 Agent、导出文件和中文账户控件没有意外旧品牌文案。
- 模型请求仍只访问确认后的网关；Canvas 代理、SSE、CORS、取消和重试测试通过。
- 旧版本用户数据、协议链接和安装升级关系按迁移方案保留。
- `rg` 复核用户可见旧品牌，`git diff --check`、TypeScript、lint、单元测试、构建和桌面 E2E 按风险执行并记录实际结果。

## 7. 待项目所有者确认

1. 新品牌全称、中文名、英文大小写、简称及 `Account`/`Agent`/`Canvas` 子品牌规则。
2. PNG、ICO、ICNS、SVG、macOS 模板图标、favicon、移动端图标和启动图全套资源。
3. 官网、模型网关、账户面板、Canvas 第二服务源、兑换码页、支持邮箱、帮助中心、隐私政策和服务条款。
4. 是否保留 Chatbox AI Provider、旧教程、旧示例素材、旧许可证/上报能力及其用户可见入口。
5. 是否变更 npm 包名、Electron appId、深度链接协议和持久化键；接受的兼容周期、迁移方式和回滚方案。

## 本轮核查范围

已使用 `rg` 核对 `src/`、`assets/`、`resources/`、`package.json`、`release/app/package.json`、`electron-builder.yml`、`README.md` 和 `.github/workflows/`。本轮只更新知识库文档，不修改业务代码、域名、品牌资源或运行时配置；未执行 TypeScript、lint、单元测试、构建、打包和桌面 E2E。
