# ADR-0006：sub2api API Key 与 Chatbox Provider 绑定边界

- 状态：Accepted
- 日期：2026-08-06
- 决策者：主 Agent（依据 ADR-0001 的控制面/数据面分离）

## 背景

面板 JWT/refresh token 用于 `/api/v1` 账户控制面，用户 API Key 用于 `/v1` 模型数据面。Chatbox 既有 Provider 设置会在 renderer 侧持久化模型 API Key；若直接把 `/api/v1/keys` 的完整响应暴露给账户页面，会让所有列表读取都携带完整 Key，扩大泄露面。

## 决策

1. 面板 JWT/refresh token 继续只驻留 Electron 主进程，不进入 renderer Provider 设置。
2. API Key 列表、创建和更新结果向 renderer 返回掩码摘要，不返回完整 Key。
3. 只有用户显式选择“绑定到 Chatbox”时，主进程才按 Key ID 重新读取完整 Key、调用 `/v1/models` 验证，并通过固定 IPC 返回一次性 Provider 绑定结果。
4. renderer 将绑定结果写入 Chatbox 既有 OpenAI Provider 设置，地址由 `SUB2API_BASE_URL` 派生，鉴权模式固定为 API Key，并同步模型列表。
5. 不新增任意 URL、任意 header 或原始令牌读取 IPC；sub2api 通道继续排除在兼容 `invoke` 白名单之外。

## 影响

- 普通 Key 列表和管理操作不会把完整 Key 暴露给 renderer。
- 显式绑定后，用户 API Key 会进入 Chatbox 既有 Provider 持久化存储；其保护强度与其他 Provider API Key 相同，不等同于主进程内存中的面板令牌。
- renderer 脚本注入仍可能读取已绑定的 Provider Key；后续如将模型请求整体迁移到主进程，需要新增 ADR 和数据迁移。
- 绑定使用内置 OpenAI Provider，可复用现有模型调用、设置和测试能力，不新增平行 Provider 实现。

## 验证

- 自动化测试覆盖 Key 摘要脱敏、CRUD 鉴权、模型网关鉴权、IPC sender 校验和 Provider 设置写入。
- 真实实例只读验证 Key 列表与 `/v1/models`，不在未授权情况下创建、修改或删除线上数据。

## 回滚

移除账户页的 Key 管理与绑定入口，并清除本项目写入的 OpenAI Provider 配置；不得通过恢复完整 Key 列表暴露来回滚。
