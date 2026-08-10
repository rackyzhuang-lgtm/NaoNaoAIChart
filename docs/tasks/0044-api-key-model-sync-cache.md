# 任务 0044：API Key 聊天模型同步与缓存修复

- 状态：代码修复完成，自动化验证已完成。
- 日期：2026-08-10

## 问题

用户在 macOS 登录并创建 API Key 后点击“用于聊天”，发现同步到客户端的模型不准确；Windows 可能被已有本地缓存掩盖。现有绑定流程请求 `/v1/models` 时没有显式禁止缓存，且只更新 Provider 模型列表，没有更新全局默认聊天模型。

## 修复

- `/v1/models` 请求使用 `cache: no-store`，并发送 `Cache-Control: no-cache, no-store, max-age=0`，避免客户端或中间缓存返回旧模型列表。
- Provider 绑定契约要求模型列表至少包含一个模型，避免空响应继续写入不可用配置。
- 点击“用于聊天”后，将新绑定模型列表中的首个模型写入 `defaultChatModel`；后续新会话不会继续使用旧的默认 Provider/模型。

## 验收标准

- [x] API Key 模型请求显式禁用缓存。
- [x] 绑定结果覆盖 OpenAI Provider 的旧模型列表。
- [x] 绑定结果更新全局默认聊天模型。
- [x] 定向客户端、契约、Provider 绑定和 API Key UI 测试通过。
- [x] Node 22 TypeScript、Biome、全量测试和生产构建已执行并通过。
- [ ] 真实 macOS/Windows Electron 窗口操作待执行；本轮不使用真实账户或模型请求。
