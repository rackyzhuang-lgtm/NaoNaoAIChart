# 任务 0061：测试修复后的 v1.22.12 远程 Release

- 状态：进行中
- 日期：2026-08-14
- 根因：`v1.22.11` 的 Windows/macOS 流水线因过期订阅摘要测试失败，未进入打包步骤。

## 范围

- 发布 `Sub2ApiUsageSummary` 测试契约修复。
- 使用 `release/app/package.json` 版本 `1.22.12` 创建新标签 `v1.22.12`。
- 推送到 `github-build`，触发 Windows/macOS 构建和 GitHub Release。

## 验收标准

- [ ] 修复提交推送到 `main`。
- [ ] `v1.22.12` 标签与 `release/app/package.json` 版本一致并已推送。
- [ ] 远程流水线已触发；不等待构建完成。
- [x] 定向 `Sub2ApiUsageSummary.test.tsx` 2/2 通过。
- [x] 未执行本地构建或安装包打包。
