# ADR-0023：聊天框三档权限策略

- 状态：Accepted
- 日期：2026-08-11
- 关联任务：`docs/tasks/0059-chat-permission-policy.md`

## 背景

知识库证据显示，Codex 将审批策略、sandbox/permissions 和工具调用暂停恢复分开装配。当前 NaoNaoAI Chat 已有 Agent 工具、sandbox、工作目录授权、命令审批和外部文件审批，但 UI 只有批准/完全访问两档，且旧字段为布尔值。

## 决策

1. 新增会话级 `agentApprovalPolicy`：`ask | risk | full`。
2. 旧 `agentFullAccess` 只作为兼容输入，不能与新字段产生相反语义；新字段优先。
3. `risk` 复用既有命令 whitelist 与 AI safety assessment，不新增一套风险分类器。
4. 文件写入/编辑的 sandbox、绑定工作目录和危险 app action 继续由现有边界控制；`full` 只跳过命令和外部文件的逐次审批。
5. 互联网访问不通过隐藏 prompt 授权；用户仍需在聊天框显式启用 Web Search。`ask` 在每次 `web_search`/`parse_link` 执行前复用现有 app-action pause/continue 链审批，`risk/full` 对已启用的只读联网工具直接执行。
6. 权限设置只进入本地 Session/新会话状态，不进入 renderer 长期凭证或远程 API。

## 取舍

这不是对 Codex app-server 协议的复制。当前版本复用本地现有 app-action 审批链，避免新增 RPC、网络端口和跨进程凭证边界。联网审批和图片生成、支付等危险 app action 使用相同的暂停/恢复基础设施，但 `full` 仍不能绕过后两者的独立确认。
