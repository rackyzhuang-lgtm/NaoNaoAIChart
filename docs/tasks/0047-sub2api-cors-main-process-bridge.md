# 任务 0047：sub2api CORS 主进程直连桥接

- 状态：已实现并完成自动化验证；真实线上模型请求未执行。
- 日期：2026-08-10
- 关联 ADR：ADR-0017

## 目标

解决 renderer 直接请求 `https://naonaoai.shop/v1/responses` 时因服务端未返回 CORS 头导致的预检失败，同时保持上游目标和路径不变。

## 实现范围

- 通过受信任 IPC 将固定 `naonaoai.shop/v1/*` 请求交给 Electron 主进程发送。
- renderer 将主进程返回的状态、响应头和响应体重建为 `Response`，保留 Responses SSE 解析链路。
- 拒绝非固定服务 origin、非 `/v1/` 路径和重定向；不开放通用代理 URL。

## 验收标准

- [x] renderer 不再对 `naonaoai.shop` 发起跨域 fetch 或预检请求。
- [x] 主进程实际请求目标仍为 `https://naonaoai.shop/v1/responses`。
- [x] IPC 请求限制为固定 origin、`/v1/` 路径和有限 HTTP 方法。
- [x] 直连桥接、账户 IPC 和请求层定向测试通过。
- [x] TypeScript、Biome 和 `git diff --check` 通过。
- [x] 未执行真实线上模型请求。

## 验证记录

- 请求层 Vitest：4 项通过；账户主进程客户端和 IPC 测试：27 项通过；画布 Agent 相关测试：5 项通过。
- Node 22 TypeScript、变更文件 Biome 和 `git diff --check` 已执行。
