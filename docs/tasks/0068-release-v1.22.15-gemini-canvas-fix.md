# 任务 0068：v1.22.15 Gemini 无限画布修复 Release

- 状态：阻塞
- 日期：2026-08-14

## 范围

- 发布 Gemini 无限画布协议分流和 `x-goog-api-key` 代理转发修复。
- 使用 GitHub Actions 执行 Windows/macOS 安装包构建和 tag Release。
- 不执行本地桌面安装包打包，不修改 `D:\project\EazyAI-Chat`。

## 发布条件

- `release/app/package.json` 版本为 `1.22.15`。
- 创建并推送不可移动的 `v1.22.15` tag。
- GitHub Actions 的 Windows、macOS 构建和 Release job 均由 tag 触发。

## 验证

- 已通过本次修复的定向 Vitest 26 项、`corepack pnpm check` 和 `git diff --check`。
- 发布前不执行本地打包；远程流水线结果以 GitHub Actions 页面为准。

## 阻塞项

- 推送目标 `git@github.com:rackyzhuang-lgtm/NaoNaoAIChart.git` 时，GitHub 拒绝当前 SSH 身份 `racky77-coder` 的写入权限。`v1.22.15` tag 未创建或推送，故远程打包和 Release 尚未触发。
