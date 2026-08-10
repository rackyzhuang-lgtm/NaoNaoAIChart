# 任务 0046：OpenAI Responses API 入站请求

- 状态：已实现并完成自动化验证；真实模型请求未执行。
- 日期：2026-08-10
- 关联 ADR：ADR-0016

## 目标

将 NaoNaoAI Chat 对 sub2api 的 OpenAI 入站请求统一使用 `/v1/responses`，避免继续发送 `/v1/chat/completions`。

## 实现范围

- API Key“用于聊天”绑定到内置 OpenAI Responses Provider。
- NaoNaoAI 上游目标为 `https://naonaoai.shop/v1/responses`，renderer 通过主进程直连，不改写为 `/_naonao_proxy/...`。
- 无限画布 Agent 使用 Responses 请求体、工具格式和 SSE 事件格式。
- 保留其他 OpenAI-compatible Provider 的既有 Chat Completions 行为。
- 用户可见的内置 OpenAI Provider 只保留一个 Responses 入口，旧 Chat Completions Provider 仅内部兼容。

## 验收标准

- [x] API Key 用于聊天后保存的 Provider 为 `openai-responses`，路径为 `/v1/responses`。
- [x] 无限画布 Agent 的上游请求路径为 `/v1/responses`。
- [x] NaoNaoAI 请求保持直连 URL，不经过 loopback 代理路径。
- [x] 用户可见 Provider 列表只显示一个“OpenAI”入口。
- [x] Responses SSE 文本、工具调用和 usage 可正确解析。
- [x] 旧 Chat Completions 流解析测试与其他 Provider 测试不回归。
- [x] TypeScript、定向 Vitest、Biome 和 `git diff --check` 通过。
- [x] 未执行真实线上模型请求，避免使用生产凭证产生费用。

## 验证记录

- 定向 Vitest：3 个文件、6 项通过，覆盖 OpenAI Responses 流事件、画布 Agent 上游请求和聊天 API Key Provider 绑定。
- Node 22 TypeScript 检查和变更文件 Biome 检查通过。
- 未使用真实 API Key 调用线上 Responses API。
