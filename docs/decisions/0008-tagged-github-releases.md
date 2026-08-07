# ADR-0008：使用版本标签发布 GitHub Release

- 状态：Accepted
- 日期：2026-08-07
- 决策者：项目所有者、主 Agent

## 背景

GitHub Windows/macOS 流水线最初只上传有 14 天保留期的 Actions artifacts，不创建 GitHub Release。项目所有者现要求安装包出现在 Releases 页面，并要求修复 macOS DMG 辅助工具镜像缺失导致的打包失败。

## 决策

1. `main` push 和手动运行继续只生成 Actions artifacts，不自动创建 Release。
2. 推送与 `release/app/package.json` 打包版本一致的 `v*` 标签时，在 Windows 和 macOS job 全部成功后创建 GitHub Release。
3. Release 仅附加 `.exe`、`.dmg` 和 `.zip` 安装包；electron-builder 继续使用 `--publish never`，避免重新引入上游 publish provider 或自动更新发布行为。
4. Release job 单独获得 `contents: write`，其他 job 保持 `contents: read`；使用 GitHub 自动提供的短期令牌，不提交 PAT。
5. macOS 的 electron-builder 辅助二进制文件显式使用官方 GitHub Release 基地址，覆盖 runner 可能注入的 npm 镜像配置；Electron 本体和 npm 包仍可使用现有 npmmirror。Windows 保持已经验证成功的镜像配置。
6. 当前发布包仍未正式签名或公证；GitHub Release 不代表生产签名、notarization 或自动更新已经完成。

## 备选方案

- 每次 `main` push 创建或覆盖 Release：拒绝，无法形成稳定版本边界，且容易覆盖可追溯产物。
- 继续只使用 Actions artifacts：拒绝，不满足项目所有者要求的 Releases 下载入口。
- 启用 electron-builder publish provider：暂不采用，当前自有更新服务、签名和回滚策略仍未完成。

## 影响

- 正式 GitHub Release 由版本标签触发，标签值与实际打包版本不一致时流水线失败。
- Release 创建依赖 Windows/macOS 两个平台都成功，任一平台失败都不会发布不完整 Release。
- 未签名 Windows 包和 ad-hoc 签名、未公证 macOS 包仍可能触发操作系统安全提示。

## 验证方式

- 静态解析 workflow YAML，并检查 job 条件、权限和 artifact 流向。
- 推送 `v1.22.1`，确认两个构建 job、Release job 和 Releases 资产列表。

## 待确认

- 正式签名证书、Apple notarization、自动更新 feed、回滚与保留策略。
