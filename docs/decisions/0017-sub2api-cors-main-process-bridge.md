# ADR-0017：sub2api 模型请求通过主进程直连

## 状态

已接受（2026-08-10）。

## 背景

sub2api 的 `/v1/responses` 没有返回 renderer origin 所需的 CORS 头。Electron renderer 直接请求会在预检阶段失败；将 URL 改写为 `/_naonao_proxy/...` 又会暴露错误的入站路径并不符合产品约定。

## 决策

- renderer 通过受信任 IPC 提交模型网关请求，Electron 主进程直接请求 `https://naonaoai.shop/v1/*`。
- IPC 只允许固定 origin、`/v1/` 路径、有限方法和必要请求头；拒绝开放代理、重定向和任意目标 URL。
- 主进程返回有限响应元数据和响应体，renderer 重建标准 `Response`，现有 AI SDK 和 Responses SSE 解析保持不变。

## 影响

模型流式响应在当前桥接实现中由主进程读完后返回 renderer，消除了 CORS 但不提供网络层的逐块 UI 增量；后续若需要更低延迟，可在同一固定 IPC 契约上增加受控流式通道。
