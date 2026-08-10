# 任务 0053：测试启动清缓存与聊天模型获取修复

- 状态：代码修复和自动化验证完成，真实模型请求待手工验收
- 日期：2026-08-10

## 问题

用户反馈每次启动都希望清除缓存后测试，且聊天窗口获取模型异常。检查发现“用于聊天”绑定结果写入 `openai-responses`，但随后创建的新会话硬编码使用旧的 `openai` Provider；桌面主进程直连模型网关时也没有再次强制禁止缓存。后续手工发送验证发现服务端成功响应后客户端仍失败，日志确认主进程在完整读取 SSE 响应时触发固定 30 秒超时。再次验收时发现同一聊天请求被发送三次；代码复核确认请求工具允许 POST 重试，模型层还会对 429/5xx 自动重试，任一层都可能在服务端已经处理请求、但客户端没有正确接收响应时重复提交。关闭这些路径后，项目所有者再次发送 `hi`，后台仍分别在 20:52:20 和 20:52:31 收到两次请求，说明还需要在主进程实际出网边界执行最终去重。

## 范围

- 增加仅供测试使用的启动缓存清理开关：`NAONAOAI_CLEAR_CACHES_ON_STARTUP=1`，并提供 `pnpm start:clean` 开发启动脚本。
- 清理 Chromium HTTP/cache storage 和 models.dev 模型注册表缓存；保留配置、登录令牌、API Key、聊天记录、知识库和附件数据。
- 新聊天会话使用 sub2api 绑定的 `openai-responses` Provider。
- 桌面直连 `/v1/*` 请求由 renderer 和主进程共同发送 `Cache-Control: no-cache, no-store, max-age=0`。
- 网关请求的 30 秒超时只覆盖连接与响应头阶段，不中断已开始的 SSE 响应读取。
- 固定 sub2api 网关的聊天 POST 强制单次发送；请求工具忽略该 POST 的重试参数，模型层也不再对该网关的 429/5xx 自动重新提交。
- 同一会话、同一用户消息 ID 的在途重复提交直接复用第一次任务结果，不再排队后重复发送；不同消息仍使用会话生成锁等待前一个生成请求结束。
- 主进程对固定网关 POST 使用只存在内存中的 SHA-256 请求指纹：相同请求在途时合并，完成后 20 秒内再次出现时复用第一次结果，不再次访问后台；指纹包含账户凭证但日志只输出不可逆指纹前缀，不输出密钥、请求体或响应体。
- 保留模型列表等 GET 请求的既有重试行为。

## 功能测试与验收标准

- [x] 开关关闭时启动不清理任何用户数据。
- [x] 开关开启时只清理可重建缓存，不删除配置、凭证、聊天记录或数据库。
- [x] “用于聊天”创建的新会话使用 `openai-responses` 和绑定返回的首个模型。
- [x] `/v1/models` 直连请求携带 `Cache-Control: no-cache, no-store, max-age=0`。
- [x] SSE 响应在连接成功后持续超过 30 秒仍可完整返回 renderer。
- [x] 固定 sub2api 聊天 POST 失败时主进程桥接只调用一次，不自动重试。
- [x] 固定 sub2api 的模型层状态错误不触发自动重试；其他 Provider 的既有状态重试策略不变。
- [x] 同一会话、同一消息 ID 在任务未完成时重复提交只执行一次；任务结束后允许正常再次操作。
- [x] 主进程相同网关 POST 在途时只执行一次 fetch，完成后 20 秒内相同请求也不再次 fetch。
- [x] 请求体变化或 20 秒窗口过期后允许正常发送，GET 不使用 POST 结果复用。
- [x] 模型列表等 GET 请求仍可按既有策略重试。
- [x] 定向 Vitest、TypeScript、Biome、`git diff --check` 实际执行并记录结果。
- [ ] 真实 Electron 窗口及真实模型请求：待执行（需要项目所有者提供测试时机/凭证，不提交或记录秘密）。

## 验证记录

- `corepack pnpm exec vitest run src/main/test-cache.test.ts src/renderer/components/settings/Sub2ApiKeySettings.test.tsx src/main/sub2api/client.test.ts src/renderer/utils/request.test.ts`：4 个文件、38 个用例通过。
- 重复发送修复定向测试：`corepack pnpm exec vitest run src/renderer/utils/request.test.ts src/shared/sub2api/url.test.ts src/shared/models/abstract-ai-sdk.test.ts`，3 个文件、23 个用例通过。
- 最终相关回归测试覆盖请求路由、主进程网关、模型重试策略和会话在途去重：5 个文件、53 个用例通过。
- 主进程最终出网去重新增 3 个回归用例；本轮定向测试 4 个文件、44 个用例通过。
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit --pretty false`：通过。
- 变更范围 Biome：通过，无新增 error。
- `git diff --check`：通过。
- `corepack pnpm run build`：通过（退出码 0）；保留既有的 chunk 循环依赖、chunk 体积和依赖 `eval` 警告。
- `corepack pnpm test -- --reporter=dot`：256 个测试文件、2481 个用例通过，3 个文件/61 个用例跳过；Vitest 最后报告一个 worker 意外退出的未处理错误并以退出码 1 结束，因此全量测试不记为通过。
- `NAONAOAI_CLEAR_CACHES_ON_STARTUP=1 corepack pnpm start`：开发 main/preload/renderer 构建完成，renderer `http://localhost:1212/` 和 Electron 应用启动完成；随后主动结束测试进程。`pnpm start:clean` 固化同一测试启动配置。
- `pnpm start:clean`：本轮已后台启动供项目所有者手工测试，renderer `http://localhost:1212/` 返回 HTTP 200；未发起真实模型请求。
- 本轮修复后再次执行 `pnpm start:clean`：后台 Electron 开发客户端启动完成，renderer `http://localhost:1212/` 返回 HTTP 200；内置浏览器实际读取首屏标题 `NaoNaoAI Chat` 和 NaoNaoAI Logo；未发起真实模型请求。
- 手工失败日志：`sub2api:direct-gateway-request` 原先在 30 秒后出现 `DOMException [TimeoutError]`；修复后主进程只在响应头前使用连接超时，已建立的 SSE body 不再被该计时器中止。
- 修复后 `pnpm start:clean` 已重新启动，renderer `http://localhost:1212/` 返回 HTTP 200；等待项目所有者重发一条消息完成真实窗口验收。
- 本机测试前已清理 Chromium Cache、Code Cache、GPU/Dawn cache、Shared Dictionary 和 `model-registry-cache-v2`；已复核 `config.json`、`IndexedDB`、`chatbox-databases` 保留。
