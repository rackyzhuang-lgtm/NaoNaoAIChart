# 任务 0018：Gitee Go Linux 安装包流水线

状态：Done

## 目标

- 在 Gitee Go 云构建环境中生成 Linux x64 AppImage 和 deb 安装包。
- 将筛选后的安装包和更新元数据上传到 Gitee 默认制品库，供项目成员下载验证。

## 范围

- 使用 Gitee Go 官方 `.workflow/*.yml`、`build@gcc`、暂存产物和 `publish@general_artifacts` 配置。
- 固定 Node.js `22.16.0` 和 pnpm `10.33.0`，满足仓库工具链约束。
- 在打包前执行依赖锁定安装、TypeScript、Biome 和全量 Vitest。
- 只上传 `release/build` 根目录中的 AppImage、deb、YAML 和 blockmap 文件，不上传解包目录。

## 非目标

- 本批不生成 Windows NSIS 或 macOS dmg；Gitee Go 公共云构建插件提供 Linux 容器，另外两个平台需要对应 runner。
- 本批不配置 Windows/macOS 代码签名、Apple notarization、自有更新 feed 或自动发布。
- 本批不调用真实模型 API，不登录 sub2api，也不写入线上数据。

## 验收

- `.workflow/LinuxPackage.yml` 可被标准 YAML 解析器加载。
- 流水线只在 `main` push 时自动触发，也可从 Gitee Go 控制台手动执行。
- 构建步骤固定工具链版本，执行 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm lint`、`pnpm test` 和 Linux x64 打包。
- 上传步骤依赖构建暂存产物，并将其写入 Gitee 默认制品库。
- 本地验证和首次远端流水线结果均按实际执行情况记录，不把未执行的远端任务写成通过。

## 实现

- 选择 `build@gcc` 的 Ubuntu 20.04 基础环境，而不是 Gitee Go 的 `build@nodejs`；后者官方支持的最高 Node.js 版本为 15.12.0，不满足项目 Node 22 约束。
- 构建阶段下载固定的官方 Node.js Linux x64 压缩包，并缓存工具目录、pnpm store、Electron 和 electron-builder 下载目录。
- 构建阶段使用 npmmirror 的 Node.js、npm、Electron 和 electron-builder binaries 镜像，避免 Gitee 云 runner 访问海外默认源超时；版本和下载路径仍固定。
- electron-builder 固定 `--publish never`，避免向任何上游或未配置的更新服务发布。
- 安装包暂存名为 `LINUX_X64_PACKAGES`，永久制品名为 `naonaoai-linux-x64`。

## 验证结果

- 本地 YAML 解析：通过；解析到 1 个 stage，步骤为 `build@gcc` 和 `publish@general_artifacts`。
- `corepack pnpm check`：通过，TypeScript 0 error。
- `corepack pnpm lint`：通过，0 error，保留 888 个既有 warning。
- `corepack pnpm test`：通过；242 个文件通过、3 个跳过，2,453 项通过、61 项跳过。
- `corepack pnpm run build`：通过；main、preload、renderer 生产构建完成，保留既有依赖 `eval`、循环分块、Browserslist 和大 chunk warning。
- `git diff --check`：通过。
- 本机 Windows 交叉执行 `electron-builder build --publish never --linux AppImage deb --x64` 已进入 Linux x64 解包阶段，但 Electron Linux 运行时 111 MB 下载长时间无进展后中止，未生成安装包；这不代表 Gitee Go 远端执行结果。
- Gitee Go 首次远端执行：待本批推送后验证。

## 遗留项

- Windows、macOS 和 Linux arm64 构建仍属于跨平台构建矩阵任务。
- 正式分发前仍需完成代码签名、公证、许可证和更新/回滚验证。
