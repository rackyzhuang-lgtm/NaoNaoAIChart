# ADR-0016：NaoNaoAI Chat 使用 OpenAI Responses API

## 状态

已接受（2026-08-10）。

## 背景

NaoNaoAI Chat 对接的 sub2api OpenAI 入站接口要求使用 `/v1/responses`。当前 API Key 导入和无限画布 Agent 仍使用 Chat Completions 协议，导致请求协议不一致。

## 决策

- API Key 导入到聊天时使用内置 `openai-responses` Provider，固定请求路径为 `/v1/responses`。
- NaoNaoAI 的上游目标为 `https://naonaoai.shop/v1/responses`；renderer 通过受信任主进程 IPC 发送，不经过 `/_naonao_proxy/...` loopback 改写。
- 无限画布 Agent 使用 Responses API 的 `input`、Responses 工具定义和 SSE 事件，不依赖 Chat Completions 兼容转换。
- 其他 Provider 和用户手动配置的 OpenAI-compatible Chat Completions Provider 保持原行为。
- 用户可见列表隐藏旧 OpenAI Chat Completions Provider，仅保留一个名为“OpenAI”的 Responses Provider；旧 Provider 定义仍保留用于历史配置兼容。
- 不在 renderer 保存或暴露 API Key；真实线上模型请求不纳入自动化测试。

## 影响

Responses API 的文本增量、函数调用增量和 usage 事件需要单独解析；现有 Chat Completions 解析器保留给兼容 Provider 测试和其他调用方。
