# TASK-0026：按用户需求执行本地功能验收

- 状态：Completed
- 负责人：Codex
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0007

## 验收目标

按项目所有者最初反馈的三项需求重新验证当前桌面应用：

1. 启动阶段不显示 Chatbox 品牌启动画面或默认可达入口。
2. 主侧栏存在 NaoNaoAI 账户入口，固定账户服务可连接，未登录状态显示可操作的登录表单。
3. 普通用户的 API Key、用量、兑换码、渠道、模型广场和公告能力具有明确的账户中心入口；服务端关闭的能力显示准确状态，不伪造可用性。

## 范围

- 重新读取状态、项目、架构、路线图、上游说明及相关任务/ADR。
- 运行账户及 sub2api 普通用户模块的定向测试。
- 运行 TypeScript、生产构建和锁定 Playwright 桌面烟测。
- 使用临时用户目录启动真实 Electron，并只读检查固定服务公共设置、登录表单和可见入口。

## 安全边界

- 不使用或输出真实账号密码、JWT、refresh token 或完整 API Key。
- 不执行真实登录、兑换、Key 写操作、公告已读写入或付费模型调用。
- 不将服务端关闭的渠道/模型广场能力写成可用。

## 验证结果

- 重新读取 `docs/STATUS.md`、`PROJECT.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`UPSTREAM.md`，以及账户、API Key、渠道、模型广场、公告、启动入口相关任务和 ADR-0001/0003/0005/0007；文档边界与当前代码一致。
- 固定服务公共设置只读请求成功，返回 `code=0`、版本 `0.1.171`；Turnstile 和腾讯验证码关闭，渠道监控开启，可用渠道和模型广场关闭。
- 启动页静态验收通过：`src/renderer/index.html` 与 `index.ejs` 均显示 `NaoNaoAI Chat`，旧启动字标类保持 `display: none`。
- sub2api 契约、client、session、IPC、账户、用量、渠道、模型广场、公告、兑换码、API Key 和 Provider 绑定定向 Vitest：14 个文件、69 项通过。
- `corepack pnpm check` 通过；`corepack pnpm lint` 通过，0 error，保留 888 个既有 warning。
- 全量 Vitest 首次并发运行：240 个文件通过、3 个跳过，2,453 项通过、61 项跳过；两个 Windows PowerShell Unicode 用例受并发编码环境干扰失败。将对应两个文件限制为单 worker 独立复跑后，2 个文件、20 项全部通过。
- `corepack pnpm test:e2e` 完成生产 main/preload/renderer 构建；锁定 Playwright 桌面烟测 1 项通过。构建保留既有依赖 `eval`、循环分块、Browserslist 数据过期和大 chunk warning。
- 额外真实 Electron 烟测使用临时用户目录：窗口标题和首屏品牌为 `NaoNaoAI Chat`，主侧栏账户入口可见，账户页电子邮件/密码输入可见且填写后登录按钮可用，未显示 `Chatbox AI` 或“账户服务不可用”，公共设置和未登录会话 IPC 成功，renderer 无 page error。
- 本轮未执行真实登录，因为工作区未提供测试账号凭据；未验证登录后的线上账户数据。对应普通用户模块的本地模拟与契约测试已通过，但不得据此宣称服务端关闭的可用渠道或模型广场可用。
