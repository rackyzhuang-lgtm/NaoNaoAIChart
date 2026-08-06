# 任务 0017：Windows 全量测试与桌面 E2E 基础设施

状态：Done

## 目标

- 恢复锁定 Electron 版本的本地二进制，使主进程测试可执行。
- 修复 Windows 8.3 短路径与原生长路径混用导致的沙箱产物判断错误。
- 补齐锁定的 Playwright 依赖、桌面 E2E 配置和最小启动烟测。

## 范围

- 不调用真实模型 API，不创建、修改或删除线上 sub2api 数据。
- E2E 使用临时用户目录启动构建后的 Electron 应用，只验证窗口、产品标题和默认账户入口。
- 保留真实模型 Provider 测试的显式 opt-in 约束。

## 验收

- `corepack pnpm test` 通过。
- `corepack pnpm test:e2e` 通过。
- TypeScript、Biome、生产构建和 `git diff --check` 通过。

## 实现

- `safeRealpathSync` 先解析最近存在的父目录，再拼回尚未创建的叶子路径，统一 Windows 原生长路径语义。
- Playwright 固定为 `1.62.1`；`test:e2e` 先生成生产构建，再启动构建后的 Electron 主进程。
- E2E 通过 `E2E_TEST=1` 使用生产构建的 preload 布局，临时用户目录在测试结束后清理。
- 桌面烟测只检查 `NaoNaoAI Chat` 标题、`NaoNaoAI Account` 入口和默认页面不出现 `Chatbox AI`，不登录、不调用模型、不写线上数据。
- 删除托管链接解析移除后遗留的不可达分支，链接继续只使用现有本地解析器。

## 验证结果

- `corepack pnpm test`：通过；242 个文件通过、3 个跳过，2,453 项通过、61 项跳过。
- `corepack pnpm test:e2e`：通过；生产 main/preload/renderer 构建完成，1 项桌面烟测通过。
- `corepack pnpm install --frozen-lockfile --ignore-scripts`、`corepack pnpm check`、`corepack pnpm lint` 和 `git diff --check`：通过；整仓 lint 保留 888 个既有 warning，无 error。
- 构建保留既有依赖 `eval`、循环分块、Browserslist 数据过期和大 chunk warning。
