# ADR-0005：Electron renderer 页面与 IPC 安全边界

- 状态：Accepted
- 日期：2026-08-06
- 决策者：主 Agent（依据 ADR-0001 的既定凭证边界）

## 背景

Chatbox 基线的主窗口设置了 `webSecurity: false`，preload 同时向 renderer 暴露可调用任意字符串通道的 `invoke`。现有桌面能力包含文件读写、沙箱执行、MCP、Skills 和本地存储，无法在账户 UI 接入时继续把任意新增主进程 handler 自动暴露给 renderer。

## 决策

1. 主窗口恢复 Electron 默认的 `webSecurity: true`，继续由主进程代理需要跨域或持有凭证的业务请求。
2. preload 保留兼容 `invoke` 方法以避免一次性重写 Chatbox 的全部平台适配，但只接受共享模块中逐项列出的既有通道。
3. sub2api 通道不进入兼容白名单，只能通过 preload 的 `sub2api` 固定业务方法调用；账户令牌不返回 renderer。
4. 主窗口继续校验顶层导航和 sub2api IPC sender；外部链接仅允许 `https:` 与 `http:`。
5. 新增高权限 IPC 时必须显式更新共享白名单并接受代码审查，不得依赖任意字符串透传。

## 影响

- 远程跨域页面无法再借助关闭的同源策略访问 renderer 上下文。
- 拼写错误、未知通道和未来新增 handler 默认不能从 preload 调用。
- 兼容白名单内仍包含 Chatbox 既有的文件、沙箱和工具能力，因此这不是完整的最小 capability 重构；后续应按模块把高权限方法迁移为独立 typed API。
- renderer 自身发生脚本注入时，白名单内能力仍可能被滥用；CSP、依赖治理和各高权限 handler 的参数/目录授权仍需持续加固。

## 验证

- 单元测试覆盖已知通道允许、未知通道拒绝、sub2api 通用调用拒绝和外部协议过滤。
- 运行类型检查、全量单元测试和生产构建。
- 在 Windows Electron 开发环境验证主窗口可启动、设置可打开、账户状态可加载。

## 回滚

若个别功能因遗漏通道失效，只补充经确认的精确通道并添加测试；不恢复任意字符串透传或 `webSecurity: false`。
