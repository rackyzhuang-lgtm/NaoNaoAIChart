# 任务 0043：发布 NaoNaoAI Chat v1.22.7

- 状态：本地验证和 Windows 打包完成，待推送标签触发 GitHub Actions Release。
- 日期：2026-08-09
- 发布版本：`1.22.7`
- 触发标签：`v1.22.7`
- 发布远程：`github-release`

## 授权范围

项目所有者已明确授权本轮执行 Git 推送、桌面安装包打包和 Release 发布。

## 发布内容

- 包含当前工作区已完成的 NaoNaoAI 品牌、账户、API Key、无限画布、主聊天网络代理和 API Key 入口导航变更。
- “用于聊天”入口创建并切换新会话；“导入到无限画布”入口通过应用路由跳转。
- 不移动或覆盖历史标签；本轮创建新的不可变 `v1.22.7` 标签。

## 发布前门禁与验收

- [x] `pnpm install --frozen-lockfile --ignore-scripts`：通过。普通安装因 `zipfile@0.5.12` 原生模块缺少 VS2015/v140 工具失败；随后已手动恢复 Electron 二进制。
- [x] `pnpm check`：通过，Node `22.16.0` / pnpm `10.33.0`。
- [x] `pnpm lint`：退出码 0；保留 888 个既有 warning，无 error。
- [x] `pnpm test`：255 个测试文件通过、3 个跳过；2489 个测试通过、61 个跳过。
- [x] `pnpm run build`：通过；保留既有 eval、循环依赖、Browserslist 和大 chunk warning。
- [x] Windows 安装包：`release/build/NaoNaoAI Chat-1.22.7-Setup.exe`，147,393,374 字节，SHA-256 `7AEE310A24A5FFB13B02A0462A42129F7C6490FE5C06E1A56711039EBE33A428`。
- [x] Windows blockmap：`release/build/NaoNaoAI Chat-1.22.7-Setup.exe.blockmap`，151,885 字节，SHA-256 `400501B7220DB4E9586417D6ACE27157B519CD2B0466F1424CF6B67146841455`。
- [x] 安装包签名检查：`NotSigned`。当前环境未配置代码签名身份。
- [ ] `github-release/main` 推送成功：待提交后执行。
- [ ] `github-release/v1.22.7` 标签推送成功：待提交后执行。
- [ ] GitHub Actions Windows/macOS 打包和 GitHub Release：待远程工作流完成后确认。

## 打包过程与限制

- 首次显式 NSIS 打包因 GitHub 上 `nsis-3.0.4.1.7z` 下载连接超时失败；未把失败误记为成功。
- 设置与仓库工作流一致的 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 后，x64 NSIS 安装程序和 blockmap 成功生成。
- 当前仅在 Windows 工作区执行本地打包；macOS/Linux 安装包由 GitHub Actions 构建。
- 未执行真实账户、真实 API Key、真实模型请求或线上数据写入。
