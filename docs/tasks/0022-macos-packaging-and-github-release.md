# 任务 0022：修复 macOS 打包并创建 GitHub Release

状态：In Progress

## 目标

- 修复 GitHub-hosted macOS runner 在创建 DMG 时下载 `dmg-builder@1.2.0` arm64 工具返回 HTTP 404 的问题。
- 在 `v*` 标签构建成功后创建 GitHub Release，并附加 Windows/macOS 安装包。

## 范围

- macOS 仅通过 npmmirror 下载 npm 包；Electron 本体和 electron-builder 辅助二进制文件均使用 GitHub 官方来源。
- Windows 继续使用现有 npmmirror 配置，不改变已验证通过的打包路径。
- Release job 等待 Windows 和 macOS job 成功，下载两个 Actions artifacts，再上传 `.exe`、`.dmg` 和 `.zip`。
- Release 标签必须与 `release/app/package.json` 的实际打包版本一致。

## 非目标

- 不配置 Apple/Windows 正式代码签名或 Apple notarization。
- 不启用 electron-builder 自带 publish provider，不接入自动更新 feed。
- 不把 GitHub token、签名证书或其他秘密写入仓库。

## 验收

- workflow YAML 可解析，且 Release job 仅在 `v*` 标签运行。
- macOS 打包 Bash 步骤显式清除 `@electron/get` 会优先读取的 Electron mirror/custom-dir 变量，调用其实际 URL 解析函数断言 DMG builder 地址为 GitHub 官方来源，再直接通过 Node 启动锁定的 electron-builder CLI，避免 `pnpm exec` 重建 npm 配置环境。
- Release job 使用 job 级 `contents: write` 和 GitHub 自动令牌，不扩大构建 job 权限。
- 推送版本标签后，远端 Windows/macOS 构建与 Release 资产列表按实际结果记录。

## 当前结果

- Windows job 已由项目所有者确认成功。
- macOS 最新失败已精确定位：`dmg-builder` 的 `downloadArtifact()` 将官方地址传给 `@electron/get`，但后者优先读取 runner 注入的 Electron mirror 并改写到 npmmirror；该镜像缺少 `dmgbuild-bundle-arm64-75c8a6c.tar.gz`。这不是应用构建、ad-hoc 签名或 notarization 错误。
- electron-builder 官方 `dmg-builder@1.2.0` Release 已确认包含该 arm64 bundle 以及对应 x86_64 bundle。
- 清除 Electron mirror 后，远端 Windows/macOS job 和两个 Actions artifacts 已成功；Release job 已完成标签校验与 artifact 下载，但资产筛选的多行 `find` 表达式因缺少 shell 行续接失败。
- Release 资产筛选已改为单行 `find` 表达式，远端 Release 创建结果待标签重跑确认。
- 代码、工作流和 `v1.22.2` 已推送到新仓库 `racky77-coder/NaoNaoAIChart`，但项目所有者反馈该仓库没有产生 Actions 运行记录，Releases 页面仅显示 GitHub 自动生成的源码压缩包。
- 当前环境只有新仓库的 SSH 推送权限，GitHub REST 对私有仓库返回 404，内置浏览会话未登录，且本机没有 `gh` CLI，因此无法读取或修改仓库级 Actions 开关。按项目所有者要求，将版本递增到 `1.22.3` 并通过新提交和新标签重试；实际运行状态仍以远端页面为准。
