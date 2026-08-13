# 任务 0063：v1.22.13 类型修复远程 Release

- 状态：已触发远程工作流；按要求不等待结果
- 日期：2026-08-14
- 根因：`v1.22.12` 远程 TypeScript 检查失败。

## 验收标准

- [x] 修复提交 `f33f31e2` 已推送到 `github-build/main`。
- [x] `v1.22.13` 与 `release/app/package.json` 的 `1.22.13` 一致并已推送。
- [x] 标签推送已触发远程 Windows/macOS Release；不等待构建完成。
- [x] `pnpm check` 通过。
- [x] `Sub2ApiUsageSummary.test.tsx` 定向测试 2/2 通过。
- [x] 未执行本地生产构建或安装包打包。
