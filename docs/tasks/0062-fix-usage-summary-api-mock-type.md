# 任务 0062：修复用量摘要测试 API mock 类型

- 状态：已完成
- 日期：2026-08-14
- 关联失败：`v1.22.12` Windows/macOS 流水线 TypeScript 检查

## 根因

`Sub2ApiRendererApi` 仍定义必需的 `getSubscriptionSummary()` 方法。生产用量摘要组件已不再调用该方法，但测试 mock 删除它后无法满足接口类型，导致远程 `pnpm check` 失败。

## 修复与验证

- 在 `Sub2ApiUsageSummary.test.tsx` 保留不参与调用的 `getSubscriptionSummary: vi.fn()` mock，仅满足现有共享接口契约。
- 定向 Vitest：已通过，2 项。
- `pnpm check`：已通过。
- 未执行本地生产构建、安装包打包或完整测试。
