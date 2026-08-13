# 任务 0060：修复远程流水线中的过期用量摘要测试

- 状态：已完成
- 日期：2026-08-14
- 关联发布：`v1.22.11`

## 根因

账户页同步已移除 `Sub2ApiUsageSummary` 的订阅摘要请求和界面，但测试仍断言 `Pro plan`、订阅额度和订阅请求失败提示，导致 Windows/macOS 测试阶段失败，尚未进入打包步骤。

## 修复范围

- 更新 `src/renderer/components/settings/Sub2ApiUsageSummary.test.tsx`，使断言与当前无订阅摘要的产品契约一致。
- 不恢复已移除的订阅请求或 UI，不修改 `D:\project\EazyAI-Chat`。

## 验收标准

- 定向 `Sub2ApiUsageSummary.test.tsx` 2/2 通过。
- `git diff --check` 通过。
- 修复版本提升为 `1.22.12`，后续推送 `v1.22.12` 触发远程工作流；本轮不执行本地构建或打包。
