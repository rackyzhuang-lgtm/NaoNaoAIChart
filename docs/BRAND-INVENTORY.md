# 品牌与标识清单

更新日期：2026-08-09
用途：为后续统一更换品牌提供可审查基线。本清单不授权直接替换域名、应用 ID、协议或兼容 Provider。

## 使用方式

后续重品牌应以本文件为清单，按以下顺序拆分任务：

1. 用户可见名称、文案和 Logo。
2. 官网、支付、支持和法律外链。
3. 模型网关和 Canvas allowlist（需服务端与安全验证）。
4. 应用 ID、深度链接和本地数据迁移（需 ADR）。
5. Chatbox 兼容 Provider、远程资源和内部技术命名的保留或清理。

不要对 `Chatbox`、`naonao` 或域名做全仓库文本替换。它们在本项目中同时承担显示文案、Provider 兼容、网络路由、安装升级识别和本地数据键等不同职责。

## 当前用户可见品牌

| 名称 | 主要位置 | 后续处理 |
| --- | --- | --- |
| `NaoNaoAI Chat` | `package.json`、`electron-builder.yml`、`src/main/main.ts`、`src/main/menu.ts`、`src/main/autoLauncher.ts`、`src/main/app-updater.ts` | 产品显示名；后续替换。 |
| `NaoNaoAI Chat` | `src/renderer/Sidebar.tsx`、`src/renderer/modals/Welcome.tsx`、`src/renderer/routes/about.tsx`、`src/renderer/routes/settings/general.tsx` | 桌面 UI、欢迎页、关于页、设置页；后续替换。 |
| `NaoNaoAI Chat` | `src/renderer/index.html`、`src/renderer/index.ejs`、`src/renderer/index.web.ejs` | 标题、网页元数据和启动过渡页；后续替换。 |
| `NaoNaoAI Chat` | `src/renderer/packages/initial_data.ts`、`src/shared/utils/chat-export.ts` | 首次示例会话和导出文件内容；后续替换。 |
| `NaoNaoAI Account` | `src/renderer/routes/settings/route.tsx`、`src/renderer/components/settings/Sub2ApiAccountSettings.tsx`、`src/renderer/Sidebar.tsx`、`src/renderer/i18n/locales/{en,zh-Hans,zh-Hant}/translation.json` | 账户功能子品牌；随主品牌替换。 |
| `NaoNaoAI Agent` / `NaoNaoAI Canvas Agent` | `src/main/infinite-canvas/agent-gateway.ts`、`src/renderer/routes/infinite-canvas/index.tsx`、`src/renderer/components/infinite-canvas/CanvasAgentBroker.tsx` | 无限画布内置 Agent 名称、提示词和错误提示；随主品牌替换并复核 Agent 行为。 |

补充位置：`src/renderer/modals/AppStoreRating.tsx`、`src/renderer/lib/format-chat.tsx`、`src/renderer/routes/-new-user-scenarios/NewUserScenarioGrid.tsx`、`src/renderer/routes/guide/-hooks/useGuideSession.ts` 也有 NaoNaoAI 可见文案；重品牌时应一并检查。

## Logo 与图标资产

当前主图标是黑色线条的猫脸图标，已人工查看过资源内容。`assets/icon.png` 的 SHA-256 为 `54A669B41AE71793B233DF4515F6A51C96421E7C213E468EAE0DA8C0A5721D7E`，`src/renderer/static/icon.png` 与其相同。

| 资源 | 用途 / 消费位置 | 后续处理 |
| --- | --- | --- |
| `assets/icon.png`、`assets/icon.ico`、`assets/icon.icns`、`assets/icon.svg` | 应用打包主图标；`src/main/main.ts` 创建窗口、托盘时使用 | 新品牌需提供 Windows、macOS、Linux 对应格式，统一替换。 |
| `assets/iconTemplate.png`、`assets/iconTemplate@2x.png` | macOS 模板托盘图标 | 需使用适合 macOS 菜单栏的单色版本重新制作。 |
| `src/renderer/static/icon.png` | 侧栏、欢迎页、关于页、启动页；由 `Sidebar.tsx`、`Welcome.tsx`、`about.tsx`、`index.html`、`index.ejs` 使用 | 与打包图标同步替换，避免启动页与窗口图标不一致。 |
| `src/renderer/static/favicon.png` | 网页 favicon 候选资源；HTML 实际引用 `/favicon.ico` | 替换时需确认构建产物中 `favicon.ico` 的复制来源。 |
| `src/renderer/static/icons/icon-chatbox.svg` | 历史 Chatbox 图标资源 | 暂不删除，先确认旧会话、Provider 和迁移路径是否仍需读取。 |
| `src/renderer/static/icons/providers/chatbox-ai.png` | 历史 Chatbox Provider 图标 | 暂不删除。当前 `providerIconSrc.ts` 与 `ProviderIcon.tsx` 已阻止其作为 NaoNaoAI 界面图标显示。 |

## 域名、外链与网络边界

| 地址 | 位置 | 当前用途 / 替换风险 |
| --- | --- | --- |
| `https://naonaoai.shop` | `src/shared/constants.ts` | 固定 sub2api 面板与模型网关根地址 `SUB2API_BASE_URL`；不是纯文案。 |
| `https://naonaoai.shop` | `src/renderer/utils/request.ts` | 主聊天 renderer 到主进程 loopback 代理的精确目标和别名。 |
| `https://naonaoai.shop` | `src/main/infinite-canvas/policy.ts`、`assets/infinite-canvas/naonao-embed-bridge.js` | Canvas 受限代理 allowlist；改动必须复核 SSRF、CORS、请求方法、SSE 和重定向限制。 |
| `https://naonaoai.shop` | `src/main/menu.ts`、`src/renderer/routes/about.tsx`、`src/renderer/components/ModelSelectorV2/constants.ts` | 官网、关于页与升级外链；可随官网地址更换。 |
| `https://eazyai.shop` | `src/main/infinite-canvas/policy.ts`、`assets/infinite-canvas/naonao-embed-bridge.js` | Canvas 的第二个可信服务源；不应仅因视觉重品牌而擅自删除或替换。 |
| `https://pay.ldxp.cn/shop/naonaoai` | `src/renderer/components/settings/Sub2ApiRedeem.tsx` | 获取兑换码的内嵌购买页；需要项目所有者提供新品牌的授权替换地址。 |
| `https://gitee.com/ribbog77/nao-nao-aichart` | `package.json`、`src/renderer/routes/about.tsx`、`docs/UPSTREAM.md` | 公开仓库地址；是否随品牌变更需项目所有者确认。 |

`naonaoai.shop` 还出现在 sub2api、Canvas、主聊天的单元测试中。更换网关地址时应同时更新 URL 构建、代理、allowlist 和测试，且只在服务端切换已确认后实施。

Canvas 本地存储还使用键 `naonaoai:last-canvas-import`，位置为 `assets/infinite-canvas/naonao-embed-bridge.js`。新品牌应写入新键并兼容读取旧键至少一个版本，避免已有导入状态丢失。

## Chatbox 历史内容分层

### 历史 Provider 或运行时兼容，待产品决策

- `src/shared/request/chatboxai_pool.ts`：`api.chatboxai.app`、`chatboxai.app`、`api.ai-chatbox.com`、`api.chatboxapp.xyz` 及 beta 域名池。
- `src/shared/providers/definitions/chatboxai.ts` 与 `src/renderer/routes/settings/provider/chatbox-ai/`：旧 `Chatbox AI` Provider、帮助和登录流程。
- `src/shared/services/native-license.ts`、`src/shared/services/native-report.ts`、`src/renderer/packages/remote.ts`：历史许可、上报和远程站点路径。
- `src/main/skills/builtin/chatbox-product-info.ts`：旧产品说明与价格信息的内置 Skill。

这些内容不等同于应用总品牌。是否删除或替换取决于是否继续允许旧 Chatbox Provider，须先作产品决策和回归测试。

### 用户可见待替换或待清理

- `src/shared/models/errors.ts`：旧支持邮箱 `hi@chatboxai.com`。
- `src/renderer/routes/guide/` 和 14 个语言包：仍包含 Chatbox 名称、支持邮箱、许可说明、引导外链及社交链接。
- `src/renderer/packages/initial_data.ts`：首次示例会话仍引用 `static.chatboxai.app` 和 `download.chatboxai.app` 的头像、图片和图表示例资源。
- `src/renderer/components/common/ChatboxAIErrorMessage.tsx`、Storybook 示例及非生产示例：保留旧主页或价格链接。

这些内容在提供新支持邮箱、帮助中心、条款/隐私和示例素材来源后可分批替换。语言包不应做无语境的批量替换，因为其中部分键为上游兼容键。

### 需保留或谨慎处理的第三方归因

- `src/shared/providers/definitions/models/openrouter.ts`、`custom-openai.ts`、`openai.ts`、`openai-responses.ts`、`custom-openai-responses.ts`：含 `HTTP-Referer: https://chatboxai.app` 与 `X-Title: Chatbox AI`。

这些请求头可能影响 OpenRouter 的来源展示或服务策略。是否替换须以第三方平台要求为准，不能按界面品牌直接更改。

## 安装、协议和本地数据标识

| 标识 | 位置 | 迁移风险 |
| --- | --- | --- |
| npm 包名 `xyz.chatboxapp.ce` | `package.json` | 构建、依赖和工具识别；不是 UI 文案。 |
| Electron appId `xyz.chatboxapp.app` | `electron-builder.yml` | 影响 Windows/macOS/Linux 安装覆盖、更新识别和应用数据目录。 |
| `chatbox://`、`chatbox-dev://` | `src/main/main.ts`、`src/main/deeplinks.ts`、`src/renderer/platform/mobile_platform.ts` | 默认协议链接；直接改会使旧链接失效。 |
| `chatbox:first-successful-chat:v1` | `src/renderer/stores/firstSuccessfulChat.ts` | 首次成功对话状态；应兼容读取旧键。 |
| `chatbox:lastArchiveSessionTipAt` | `src/renderer/components/session/SessionItem.tsx` | 会话归档提示状态；应兼容读取旧键。 |

系统标识变更必须新增 ADR，采用“新标识写入、旧 app ID/协议/key 兼容读取一版”的迁移方案，并重新验证安装覆盖、升级、深度链接与本地数据保留。不能和普通 UI 改名混在同一批变更中。

## 内部技术命名

- `tailwind.config.js` 中存在大量 `chatbox-*` 设计令牌。
- `src/renderer/static/globals.css` 定义 `--chatbox-*` CSS 变量，renderer 中大量 class/color token 依赖它们。

这些是内部技术命名，不直接展示给用户。全量重命名会产生大规模 CSS/JS 改动和较高回归风险，应在产品品牌替换稳定后单独立项，而不是作为视觉改名的验收条件。

## 后续替换前需由项目所有者确认的输入

1. 新品牌全称、英文大小写、中文名称、产品简称和 Agent/账户子品牌规则。
2. 新 Logo 资源：PNG、ICO、ICNS、SVG、macOS 模板托盘图标、favicon 及使用规范。
3. 官网、模型网关、Canvas 第二服务源、兑换码购买页、支持邮箱、帮助中心、隐私政策和服务条款地址。
4. 是否保留 Chatbox AI Provider、其许可/登录/远程 Skill，以及旧示例素材。
5. 是否变更 npm 包名、Electron appId、深度链接协议和存储键；若变更，接受的兼容周期与升级迁移策略。

## 本轮验证范围

本文件所列关键名称、域名和系统标识已用 `rg` 在代码、资源和主要文档中复核。本轮未修改业务配置，未执行 TypeScript、lint、单元测试、构建、打包或桌面 E2E。
