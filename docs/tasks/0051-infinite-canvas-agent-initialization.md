# 任务 0051：修复无限画布 Agent 初始化卡死

- 状态：代码、自动化与本地 Electron 验收完成
- 日期：2026-08-10

## 问题

内置 Agent 首次连接返回空会话 `idle` 状态，创建新会话后返回 `ready` 状态，但两者的 conversation revision 都是 `1`。画布前端会拒绝 revision 未递增的状态更新，因此一直显示“正在初始化 NaoNaoAI Agent 对话”，输入框保持禁用。

## 修改范围

- 主进程 Agent 网关维护单调递增的 conversation revision。
- 首次连接保留当前 revision；每次创建新会话时递增 revision，并在 HTTP 响应和 SSE 事件中发送同一个新状态。
- 不改变凭证存储、模型请求协议或画布前端安全边界。

## 验收标准

- [x] 首次连接的 `idle` 状态可被新会话的 `ready` 状态替换。
- [x] 新会话的 revision 严格大于初始化状态 revision。
- [x] 画布 Agent 输入框在会话创建后解除禁用。
- [x] 定向 Vitest、Node 22 TypeScript、Biome 和 `git diff --check` 通过。
- [x] 当前 Electron 客户端重新加载后的手工界面验收完成。

## 验证结果

- 定向 Vitest：3 个文件、10 项通过。
- Node 22 TypeScript：通过，0 error。
- Agent 网关变更文件 Biome：通过，0 warning/error。
- `git diff --check`：通过。
- Electron 手工验收：通过。无限画布新建项目后，Agent 面板显示“工具列表加载完成，可以开始对话”，输入框为可用状态；未发送真实线上模型请求。
