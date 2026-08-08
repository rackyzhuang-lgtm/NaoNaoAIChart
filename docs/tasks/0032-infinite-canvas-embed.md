# 任务 0032：内嵌 Infinite Canvas

- 状态：Ready
- 分支：`codex/infinite-canvas-embed`
- 基线：`b67841ed745059a8b6e5141578ef5f83f764d971`
- 日期：2026-08-08

## 目标

在 NaoNaoAI Chat 中增加“无限画布”菜单入口，以内嵌 iframe 方式加载固定版本的 `basketikun/infinite-canvas`，尽量不改写上游画布业务代码。

## 实施边界

- 上游项目作为独立 web 子项目构建，不与主应用的 React、Router、Tailwind、Ant Design 依赖合并。
- Electron 主进程提供仅监听 `127.0.0.1` 的静态文件服务，renderer 通过受控 URL 加载 iframe。
- 画布首期使用自己的 IndexedDB/localStorage 命名空间，不读取 Chatbox Store，不接收 JWT、refresh token 或完整 API Key。
- 画布需要跨域访问模型服务时，仅允许 `https://naonaoai.shop` 和 `https://eazyai.shop` 两个精确 HTTPS target origin，或通过主进程受控代理访问；不关闭 `webSecurity`，不允许 `Access-Control-Allow-Origin: *` 或用户传入任意代理目标。
- 只实现菜单、宿主页、资源打包和生命周期管理；暂不实现 Chatbox 与画布的双向业务数据桥接。

## 非目标

- 不重写上游画布节点、连接、撤销重做、项目存储和导入导出逻辑。
- 不默认启用上游远程插件、Canvas Agent/MCP、WebDAV、视频/音频扩展或自定义远程脚本。
- 不把 sub2api 管理员能力、账户令牌或现有 Provider 密钥注入 iframe。
- 未经单独授权不执行 Git 推送、软件打包或 Release 发布。

## 分阶段计划

### 阶段 0：基线与上游固定

- 固定上游 commit/tag，并保留上游许可证、版权和来源说明。
- 建立独立构建命令，验证 `web` 的 `package-lock.json` 安装和 `vite build` 产物。
- 确认产物使用本地静态服务器时的资源 base、BrowserRouter fallback 和 MIME 类型。

验收：上游构建不修改源码即可重复完成；产物能在本地 HTTP 地址打开首页和 `/canvas`。

### 阶段 1：Electron 静态资源服务

- 在主进程启动/退出生命周期中增加本地静态服务器。
- 仅绑定 loopback，拒绝非 GET/HEAD、目录逃逸和非画布资源路径。
- 提供随机端口或受控内部端点，不将服务地址写入用户配置。
- 开发环境和生产 asar 路径使用同一资源解析策略。

验收：服务只接受本机请求；未知路径返回 SPA 首页或 404；应用退出后端口释放；资源在 asar 包布局下可读取。

### 阶段 1A：跨域请求通道

- 确认 `naonaoai.shop` 和 `eazyai.shop` 的 CORS 契约，记录允许 origin、methods、headers、credentials 和 OPTIONS 行为。
- 对不支持 CORS 的固定目标实现主进程受控代理；代理只允许 HTTPS 和审核过的目标 origin，阻断私网/loopback/文件协议和重定向逃逸。
- 本地静态服务和代理端点均不记录完整 API Key；错误日志只保留分类、状态码和脱敏目标。
- 为 allowlist、预检、拒绝非法 origin、拒绝任意目标和代理超时增加自动化测试。

验收：画布从 loopback origin 能访问允许的固定服务；未授权 origin、非法 method/header、任意目标 URL 和管理员路径均被拒绝；不需要将 `webSecurity` 设置为 `false`。

### 阶段 2：renderer 内嵌宿主页

- 新增 `/infinite-canvas` 路由和 iframe 宿主组件。
- 增加加载中、加载失败、重试和返回聊天状态。
- iframe 仅允许主进程生成的本地 URL，不接受用户输入 URL。
- 默认不建立 `postMessage` 业务桥；如后续需要，仅允许主题/语言等非敏感消息。

验收：桌面端可从菜单打开画布；iframe 不影响 Chatbox 主路由、侧栏和账户页；移动/Web 构建明确显示不支持或采用单独策略。

### 阶段 3：菜单、视觉和安全回归

- 在侧栏增加“无限画布”图标入口和选中态；不依赖隐藏的 Electron 原生菜单栏。
- 保持 `webSecurity: true`、`nodeIntegration: false`、`webviewTag: false` 和现有顶层导航策略。
- 验证 iframe 不能调用主应用任意 IPC，不能访问主应用 token/store。
- 对上游远程插件入口加默认关闭或明确不可用提示。

验收：安全测试确认无任意 URL 导航、无令牌泄露、无跨应用 localStorage 读取；桌面 1280x800 和 390x844 视口无布局溢出。

### 阶段 4：工程验证与阶段验收

- 执行定向宿主/静态服务器测试。
- 执行 `pnpm check`、`pnpm lint`、`pnpm test`、`pnpm run build` 和锁定桌面 E2E。
- 在 Windows 开发环境完成实际点击菜单、创建项目、拖拽缩放、刷新恢复和导入导出冒烟。
- macOS/Linux 至少完成构建矩阵验证；未执行的环境明确记录为未执行。

## 功能测试与验收标准

- 菜单入口：点击后打开 `/infinite-canvas`，返回后聊天会话状态不变。
- 画布核心：创建项目、添加节点、拖拽/缩放、撤销/重做、刷新后项目仍存在。
- 文件流程：导入一个包含图片和连接的 zip，再导出并重新导入；损坏文件显示错误而不崩溃。
- 存储隔离：画布数据只出现在自身命名空间；主应用 Store 和账户 token 不被 iframe 读取。
- 网络边界：未配置画布 API 时不发模型请求；iframe 仅访问 loopback 静态服务和用户明确配置的模型地址。
- 跨域边界：允许 origin、OPTIONS 预检、目标 URL、重定向和错误响应均有测试；不使用通配符 CORS，不把完整 API Key 写入日志。
- 目标域名：只允许 `https://naonaoai.shop`、`https://eazyai.shop`；`http`、`www`、其他子域名、非默认端口和 IP 地址均拒绝。
- 生命周期：主应用关闭后静态服务退出；重复打开不会无限创建服务或 iframe。
- 回归：账户页、聊天发送、设置页、启动页和现有桌面 E2E 无新增失败。

## 风险与决策点

- 上游 `web` 使用 BrowserRouter，必须通过本地 HTTP fallback 解决 Electron 深链接；不能直接 `loadFile`。
- 上游 API Key 仍由其自身配置页管理；若要求自动复用 sub2api Key，需新增 ADR 和安全桥接，不属于本任务默认范围。
- 跨域请求不能通过客户端任意改写响应头解决；目标服务未提供 CORS 时必须走受控代理，并接受代理带来的 SSRF、超时和凭证审计范围。
- 上游插件清单许可证与根项目声明不一致；正式分发前必须完成许可证审查。
- iframe 方案属于应用内嵌但不是源码融合；如后续要求共享会话、主题或文件，需单独设计 `postMessage` 契约。

## 本轮验证

- 已创建分支 `codex/infinite-canvas-embed`。
- 已确认基线 commit `b67841ed745059a8b6e5141578ef5f83f764d971`。
- 本轮未执行上游安装/构建、应用 TypeScript/lint/Vitest、生产构建或桌面 E2E；本轮仅完成计划和分支准备。
- 本轮新增跨域方案 ADR-0009（Proposed）；尚未执行 CORS/OPTIONS/代理实现或网络测试。
