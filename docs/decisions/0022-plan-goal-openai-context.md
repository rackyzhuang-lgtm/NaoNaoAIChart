# ADR-0022：Plan/Goal 状态归属与 OpenAI 上下文分层

- 状态：Accepted
- 日期：2026-08-11
- 关联任务：`docs/tasks/0058-plan-goal-openai-flow.md`

## 背景

项目已有 Session/IndexedDB 持久化、Agent Mode 工具链和基于 AI SDK 的 OpenAI Responses Provider。`codex_knowledge_base` 展示了 Codex 桌面端可观测的 Plan collaboration mode、Goal thread state 和 Responses 请求分层，但同时包含可执行探针、插件、第三方依赖和原生模块，不能整体复用。

## 决策

1. Plan 是一次用户轮次的协作模式。选择 Plan 后，通过模型的 developer/system 上下文注入只读规划约束；不将内部提示拼接进用户文本，不持久化为伪造用户消息。
2. Goal 是会话级持久状态，而不是 Plan 的别名。目标数据作为 Session 的向后兼容可选字段保存到现有本地存储，状态最少支持 active、paused、complete；清除表示移除目标。
3. 首版 Goal 由用户消息驱动，不实现无人值守自动续跑、后台模型调用或无限重试。未来如增加续跑，必须另立预算、停止条件和恢复策略 ADR。
4. 模式上下文装配顺序为：项目基础规则、模式规则、active Goal 上下文、实际会话消息。内部上下文使用 developer/system 角色，用户内容始终保留 user 角色。
5. OpenAI Responses 继续复用现有 AI SDK、固定网关、代理、`store: false` 和 reasoning 配置。只在当前消息装配边界增加结构化上下文，不引入 Codex app-server/RPC 或新的远程接口。
6. Plan 禁止向模型暴露项目写入、命令执行和安装类工具。Goal 是否可使用现有 Agent 工具仍由用户显式 Agent Mode 和既有权限控制。
7. `codex_knowledge_base` 仅作为设计证据，不进入 TypeScript import、动态加载、构建资源复制、测试执行或发布包。

## 结果

- 旧 Session 缺少模式/目标字段时仍按 default 工作。
- Plan 的安全约束不依赖易被用户覆盖的字符串前缀。
- Goal 可随会话本地持久化，但不会产生用户未发起的模型费用或网络流量。
- 非 OpenAI Provider 不接收 OpenAI 专属字段；共享消息角色仍遵循 AI SDK 契约。
- 知识库中的脚本、插件和原生模块不会扩大应用供应链或运行时攻击面。
