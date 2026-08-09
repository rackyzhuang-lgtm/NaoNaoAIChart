# 任务 0039：主聊天模型请求网络链路

- 状态：已完成代码修复，待真实窗口模型发送验收
- 日期：2026-08-09
- 目标：修复 NaoNaoAI Chat 主聊天访问固定 sub2api 模型网关时 renderer 报 `Failed to fetch` 的问题。

## 范围

- 仅处理桌面端到固定 `https://naonaoai.shop` `/v1` 模型网关的请求转发。
- 复用主进程 loopback 服务，保持 OpenAI Provider、流式响应和 AbortSignal 行为。
- 代理目标继续使用现有严格白名单，不修改 sub2api 服务端。

## 非目标

- 不放宽 Electron `webSecurity`、CSP 或 renderer 的任意跨域能力。
- 不新增任意 URL、任意远程代理或暴露账户令牌的 IPC。
- 不执行真实计费模型请求，除非项目所有者明确授权。

## 功能测试与验收标准

- [x] 固定 sub2api 的 GET/POST 请求在桌面端改走 loopback 代理，并保留 `/v1` 路径、鉴权和请求体。
- [x] 代理响应仅允许受信本地 renderer 跨端口读取，并保持 SSE `content-type` 与流式 body。
- [x] 非 sub2api 地址和非桌面端请求保持原有行为。
- [x] 定向 Vitest（2 文件、5 项）、TypeScript、Biome、`git diff --check` 已执行；Biome 保留既有 warning、无新增 error。
- [ ] 真实 Electron 主聊天“你好”手工冒烟：待执行，不使用未授权真实凭证。

## 验证记录

- `vitest run src/renderer/utils/request.test.ts src/main/infinite-canvas/static-server.test.ts`：通过，2 个文件、5 项测试。
- Node `v22.16.0` TypeScript：通过，0 error。
- 变更范围 Biome：无 error，保留既有 warning。
- `git diff --check`：通过。
- 直接访问 `https://naonaoai.shop/v1/models`：HTTP 401，证明服务网络可达；未携带 API Key。
- 本地 Electron 开发重启：renderer `http://localhost:1212/` 返回 HTTP 200；loopback 预检对 `http://localhost:1212` 返回 `204` 和同源回显，对 `https://evil.example` 不返回 CORS allow 头。
- `electron-vite build`：main/preload 完成，renderer 因既有生成 chunk 的 `Expected ";" but found "\\b"` 转译错误失败；本次代码未引入该 chunk，生产构建不能记为通过。
- 真实模型请求、真实 Electron 窗口手工发送和打包：未执行。
