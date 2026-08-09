# 任务 0037：修复无限画布本地存储并支持目录选择

- 状态：已实现，待手工验收
- 日期：2026-08-09
- 关联 ADR：ADR-0012

## 目标

修复无限画布“读取本地存储失败 / Internal error”，并允许用户选择应用 Chromium 本地存储目录。目录选择后提示重启，重启时通过 Electron `sessionData` 路径生效。

## 功能测试与验收标准

- [ ] 本地存储统计在 Storage API 或 IndexedDB 不可用时不再抛出 Internal error，显示可用的 0/空数据状态。
- [ ] 无限画布页面显示当前本地存储目录，并可打开系统目录选择器。
- [ ] 选择目录后保存配置并提示“重启后生效”；重启前不覆盖当前会话数据。
- [ ] 应用启动前读取已保存目录并设置 Electron `sessionData`，目录不存在时自动创建，非法路径被拒绝。
- [ ] 定向 Vitest、TypeScript、Biome、生产构建和 `git diff --check` 执行并如实记录。

## 执行记录（2026-08-09）

- [x] 新增目录校验测试及本地存储容错测试，共 2 个文件、4 项断言通过。覆盖 Storage API 缺失、存储配额读取拒绝和 IndexedDB 打开抛错时返回 0/空数据。
- [x] `corepack pnpm run check` 通过。执行包装器报告 Node `v24.14.0`、pnpm `11.16.0` 的 engine warning，但 TypeScript 返回码为 0。
- [x] 画布 `npm run build` 通过；已同步实际加载的 bundle，并保留 `naonao-embed-bridge.js` 和入口加载标签。
- [x] 变更范围 Biome 检查无 error；保留主进程、preload 和 store 文件既有 warning。
- [x] `git diff --check` 通过。
- [ ] 真实 Electron 手工验收未执行：尚未在界面中选择目录、点击重启并确认 Chromium 会话数据写入所选目录。
- [ ] 根 `pnpm run build` 在 Node 24 环境下因 Windows 访问冲突 `0xC0000005` 失败；使用 `D:\software\nodejs\node.exe`（`v22.16.0`）直接运行 `electron-vite build` 时完成 main/preload 构建，但停在路由生成阶段且没有 renderer 完成信息或退出码，因此未记为通过。

## 旧 preload 兼容修复（2026-08-09）

- 已定位无限画布不可用的直接原因：运行中的 Electron 开发进程仍加载旧版 preload，而 renderer 热更新后已调用新增的 `getInfiniteCanvasStoragePath`。旧 preload 不存在该方法，页面在渲染时抛出 `TypeError: window.electronAPI.getInfiniteCanvasStoragePath is not a function`。
- [x] 新增 `getInfiniteCanvasStoragePathApi` 能力检测。只有 `getInfiniteCanvasStoragePath` 与 `chooseInfiniteCanvasStoragePath` 都存在时才读取或选择目录；旧 preload 下不再调用缺失方法，画布仍按既有 `getInfiniteCanvasUrl` 流程加载，并显示“本地存储目录功能需要重启软件后使用”。
- [x] 执行 `corepack pnpm exec vitest run src/renderer/routes/infinite-canvas/storage-path-api.test.ts src/main/infinite-canvas/static-server.test.ts`：2 个文件、4 项测试通过。
- [x] 执行 `corepack pnpm exec biome check src/renderer/routes/infinite-canvas/index.tsx src/renderer/routes/infinite-canvas/storage-path-api.ts src/renderer/routes/infinite-canvas/storage-path-api.test.ts`：通过，0 error。
- [x] 实测正在运行的 loopback 服务：`/` 与当前 bundle 均返回 HTTP 200，入口包含当前 bundle 引用；确认并非静态服务或资源缺失导致画布不可用。
- [x] `git diff --check` 通过。
- [ ] 真实 Electron 窗口中重新进入无限画布的手工验收未执行。完整重启软件后才能同时验证新版 preload 的目录选择能力。

## 本地调试启动修复（2026-08-09）

- 启动 NaoNaoAI Chat 开发实例时，发现 TanStack 路由生成器会把 `src/renderer/routes/infinite-canvas/storage-path-api.ts` 及其测试误识别为路由，从而生成对不存在的 `Route` 导出，Vite 依赖扫描失败。这会阻断 renderer 正常加载。
- [x] 已将目录存储能力检测及其测试移至 `src/renderer/utils/`，并更新无限画布页面导入。执行 `corepack pnpm run generate:routes` 后，路由树不再包含 `storage-path-api`。
- [x] 已启动本地 NaoNaoAI Chat 调试窗口，标题为 `NaoNaoAI Chat`；renderer `http://localhost:1213/` 返回 HTTP 200，窗口具有有效主窗口句柄。
- [x] 定向 Vitest 2 个文件、4 项测试通过；变更范围 Biome 通过，0 error。
- [ ] 尚未在已启动窗口中完成无限画布交互手工验收；本地存储目录选择仍需完整重启后验证。

## 共享会话单实例保护（2026-08-09）

- 已确认 Chat renderer 与 Infinite Canvas 已按 ADR-0012 共享同一个 Electron `sessionData` 目录。用户遇到的对话 `Internal error` 发生在两个开发 Electron 实例同时访问该目录时，Chromium quota/IndexedDB 数据库无法打开或重置。
- [x] 开发模式与安装版现在均调用 `app.requestSingleInstanceLock()`；默认的共享会话数据只允许由一个 NaoNaoAI Chat 进程打开。新增 ADR-0013 记录隔离多实例调试必须使用独立用户数据目录。
- [x] 已重启本地开发窗口。启动后的会话维护和 `kb:list` 正常，未出现 quota/IndexedDB `Internal error`；通过第二次开发协议启动请求验证单实例锁：探测进程退出码为 0，系统中仅保留一个可见的 NaoNaoAI Chat 窗口。
- [ ] 未自动执行真实模型发送，避免使用实际 API 凭证；需在当前窗口中手工发送一条对话，确认模型网关响应正常。
