# 任务 0063：v1.22.13 类型修复远程 Release

- 状态：进行中
- 日期：2026-08-14
- 根因：`v1.22.12` 远程 TypeScript 检查失败。

## 验收标准

- [ ] 修复提交推送到 `github-build/main`。
- [ ] `v1.22.13` 与 `release/app/package.json` 的 `1.22.13` 一致并已推送。
- [ ] 标签推送触发远程 Windows/macOS Release；不等待构建完成。
- [x] `pnpm check` 通过。
- [x] `Sub2ApiUsageSummary.test.tsx` 定向测试 2/2 通过。
- [x] 未执行本地生产构建或安装包打包。
