# ADR-0009：Infinite Canvas 跨域请求边界

- 状态：Proposed
- 日期：2026-08-09
- 关联任务：`docs/tasks/0032-infinite-canvas-embed.md`

## 背景

内嵌的 Infinite Canvas 将运行在独立的 loopback origin（例如 `http://127.0.0.1:<port>`），而模型网关和其他用户配置服务位于不同 origin。iframe 加载本身不要求 CORS，但画布 renderer 直接调用模型 API 时会受到浏览器 CORS 和预检请求限制。

上游 Infinite Canvas 会在自身 renderer 中保存用户配置的 API Key。该凭证不等同于 NaoNaoAI 的面板 JWT/refresh token，也不能借此放宽主应用的 Electron 安全设置。

## 提议决策

1. 继续保持 `webSecurity: true`、`nodeIntegration: false`、`contextIsolation: true` 和 `webviewTag: false`；不通过关闭 Electron 同源策略解决跨域。
2. 本地画布静态服务只允许 loopback 访问；CORS 响应仅允许实际的画布 origin，不返回 `Access-Control-Allow-Origin: *`，不允许任意请求头和方法。
3. 对固定 sub2api 网关优先使用主进程受控代理或服务端明确的 CORS 配置；当前批准的目标 origin 仅为 `https://naonaoai.shop` 和 `https://eazyai.shop`。
4. 不接受 iframe 传入任意 URL 作为代理目标；禁止 loopback、私网地址、文件协议、重定向逃逸和管理员 API 路径。
5. 预检请求（OPTIONS）必须有独立测试，覆盖允许 origin、非法 origin、非法方法、非法 header、凭证和错误响应；代理不得记录完整 API Key。
6. 若产品要求支持任意第三方 Base URL，必须另立 ADR，补充 SSRF、凭证存储、证书、超时、限流和用户确认设计。

## 影响

- 画布可以向明确支持 CORS 的 provider 发起直连请求；不支持 CORS 的 provider 需要进入主进程代理适配范围。
- 画布自己的 API Key 仍由上游页面管理，不能宣称已经纳入 NaoNaoAI 主进程安全存储。
- 固定 sub2api 服务端若未返回正确 CORS，客户端只能通过代理完成跨域；不得用全局响应头注入掩盖服务端契约问题。
- allowlist 只匹配上述两个精确 origin；不自动包含 `www`、其他子域名、HTTP 版本或非默认端口。
- 新增的代理 IPC/HTTP 端点属于高风险能力，必须使用 typed API、参数校验和 sender/origin 校验。

## 验证

- 离线测试验证 CORS allowlist、OPTIONS 预检、目标 URL 校验、重定向阻断和敏感日志脱敏。
- Electron 开发环境验证画布 iframe 可加载，允许目标请求成功，未授权 origin 和任意目标请求被拒绝。
- 生产构建和桌面 E2E 验证跨域请求失败时的可见恢复提示；不执行真实计费模型请求，除非另有明确授权。

## 待确认

- `naonaoai.shop` 与 `eazyai.shop` 是否已为桌面 loopback origin 配置 CORS，以及各自允许的方法/headers。
- 首发是否只支持固定 sub2api，还是还要支持用户任意第三方 provider。
- 是否接受画布独立保存其用户输入的 API Key；若不接受，必须改为主进程凭证桥接，不能保持“完全不改写上游”。
