# ADR-0001：Chatbox 与 sub2api 的集成边界

- 状态：Accepted
- 日期：2026-08-05
- 决策者：项目所有者

## 背景

项目需要复用 Chatbox 的成熟桌面 AI 体验，同时让普通用户在应用内操作 sub2api 的自助功能。sub2api 已独立部署，并且面板 API 使用 JWT，模型网关使用用户 API Key。

## 决策

1. 以 Chatbox Community Edition 作为本仓库的桌面客户端基线。
2. sub2api 保持远程独立部署，不将其后端或数据库嵌入桌面客户端。
3. 原生实现 sub2api 普通用户控制面，不直接嵌入其 Vue 管理页面。
4. 分离账户控制面和模型数据面：
   - 用户 JWT/refresh token 只访问 `/api/v1`。
   - 用户 API Key 只访问 `/v1`、`/v1beta` 等模型网关。
5. 首选由 Electron 主进程持有账户令牌，renderer 通过最小 IPC 调用具体业务动作。
6. 管理员 API 永不进入普通用户产品导航和客户端权限模型。

## 备选方案

- 只使用 Chatbox 自建 Provider：无法满足账户、用量、订阅和支付管理目标。
- WebView/iframe 嵌入：实现快，但安全、导航、跨域和一致体验较差。
- 打包 sub2api：与现有远程部署目标冲突，桌面端运维成本过高。

## 影响

- 优点：边界清晰、桌面体验一致、服务端继续独立升级。
- 成本：需要维护 typed client、IPC、账户中心 UI 和 sub2api 版本兼容层。
- 风险：支付/OAuth 仍可能跳转外部页面；API contract 需要持续跟踪。
- 回滚：控制面模块可通过 feature flag 隐藏，保留纯 Provider 接入。

## 验证

- 完成登录、refresh、Key CRUD、模型列表和流式对话的端到端 spike。
- 验证令牌不会通过通用 IPC 或日志泄露。
- 验证普通用户凭证无法调用 `/api/v1/admin/*`。

## 待确认

- 是否保留 Chatbox 完整 Git 历史。
- 已部署 sub2api 的 URL、版本、运行模式和首发认证方式。
- 是否只允许固定 sub2api 实例。
- 支付/OAuth 是否允许系统浏览器完成。
