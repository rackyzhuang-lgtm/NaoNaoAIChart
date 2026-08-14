# 任务 0068：v1.22.15 Gemini 无限画布修复 Release

- 状态：已完成
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

## 发布结果

- 默认 SSH 身份 `racky77-coder` 与 `EazyAiShop` 均没有目标仓库写权限；使用本机的 `id_edracky_new` 身份后，修复提交已推送至 `github-build/main`。
- `v1.22.15` tag 已推送至 `git@github.com:rackyzhuang-lgtm/NaoNaoAIChart.git`，已触发 GitHub Actions 的 Windows/macOS 安装包和 Release 流程。
- 未在本地执行安装包打包，且未等待远程流水线完成。
