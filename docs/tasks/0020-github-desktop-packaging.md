# 任务 0020：GitHub Windows/macOS 安装包流水线

状态：In Progress

## 目标

- 将当前 `main` 分支推送到 `git@github.com:rackyzhuang/NaoNaoAIChart.git`。
- 使用 GitHub-hosted Windows/macOS runner 生成 Electron 安装包，并上传到 Actions 运行记录的 Artifacts。

## 范围

- 新增 `.github/workflows/desktop-packages.yml`。
- Windows 使用 `windows-2022`，生成 NSIS x64/arm64 安装包。
- macOS 使用 `macos-14`，生成 dmg/zip x64/arm64 安装包。
- 固定 Node.js `22.16.0`、pnpm `10.33.0`，执行锁定安装、TypeScript、Biome、全量 Vitest 和生产构建。

## 非目标

- 不创建 GitHub Release，不修改 Gitee 远程，不配置代码签名、公证或自动更新服务。
- 不提交 Apple、Windows 证书、GitHub PAT、sub2api JWT/API Key 或其他秘密。
- 不生成 Linux 包；Linux x64 继续由 Gitee Go workflow 负责。

## 验收

- workflow 在 `main` push、`v*` tag push 和手动触发时可运行。
- Windows 和 macOS job 均执行质量门禁后再打包，打包固定 `--publish never`。
- Actions Artifacts 分别命名为 `naonaoai-windows-installers` 和 `naonaoai-macos-installers`，保留 14 天。
- 本地 workflow/YAML 解析、类型检查和 diff 校验通过；远端首次构建结果按实际运行记录。

## 结果

任务完成后补充 GitHub 远端地址、提交 SHA、workflow 运行链接和两个 artifact 的实际文件列表。
