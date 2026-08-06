# TASK-0005：sub2api 流式对话闭环

- 状态：Completed（真实线上调用待显式授权）
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0006

## 目标

验证已绑定到 Chatbox OpenAI Provider 的 sub2api API Key 可以通过现有模型调用链完成 OpenAI-compatible 流式对话，同时为真实线上调用提供显式环境变量门槛。

## 范围

- 增加不依赖网络的 SSE 流式适配器回归测试。
- 增加显式 opt-in 的真实 sub2api 流式测试；未设置环境变量时不得发起线上请求。
- 验证固定 `SUB2API_BASE_URL`、`/v1/chat/completions`、API Key 鉴权、模型 ID 与 `stream=true` 请求契约。
- 更新路线图和状态记录，明确真实聊天仍需用户主动提供 API Key 环境变量。

## 非目标

- 不把 API Key、账号密码或测试数据写入仓库。
- 不在默认 `pnpm test` 中发送真实计费请求。
- 不修改 sub2api 服务端或新增平行 Provider。

## 验收标准

- [x] SSE 流式适配器测试通过，并断言请求 URL、鉴权头、模型和 `stream=true`。
- [x] 真实测试仅在 `RUN_SUB2API_STREAM_TESTS=1` 且提供 `SUB2API_TEST_API_KEY`、`SUB2API_TEST_MODEL` 时运行；默认运行显示为 skipped，不发起网络请求。
- [x] TypeScript、相关测试、Biome 和生产构建通过。
- [x] `docs/STATUS.md` 与 `docs/ROADMAP.md` 已记录实际结果和剩余风险。

## 验证记录

- 离线 Vitest：1 个文件、1 项通过；验证 `https://naonaoai.shop/v1/chat/completions`、Bearer 鉴权、模型 ID、`stream=true`、SSE 文本拼接、finish reason 和 usage。
- 默认集成 Vitest：真实测试 1 项 skipped；未设置 `RUN_SUB2API_STREAM_TESTS`，未发起线上请求。
- `corepack pnpm check`：通过，TypeScript 0 error。
- 相关 Biome：通过，0 error、0 warning。
- `corepack pnpm exec electron-vite build --mode production`：通过，main/preload/renderer 均完成构建；保留既有依赖 eval、循环依赖和大 chunk 警告。

## 遗留风险

- 尚未获得“允许产生模型调用费用”的明确授权，因此未执行真实 sub2api 聊天请求；需要用户提供临时环境变量后单独运行该测试。
- `test:e2e` 仍缺少 Playwright 配置和锁定依赖，不能据此声称桌面 E2E 通过。
