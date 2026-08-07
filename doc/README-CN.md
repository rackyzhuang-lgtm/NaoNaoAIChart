# NaoNaoAI Chat

NaoNaoAI Chat 是面向 sub2api 普通用户的桌面 AI 客户端。它将本地会话和账户自助操作集中在 Windows、macOS、Linux 桌面应用中。

## 产品范围

- 固定服务：[naonaoai.shop](https://naonaoai.shop/)
- 仅支持桌面端；暂不支持 iOS 和 Android。
- 账户功能包括登录、API Key 管理、用量摘要、渠道监控、模型广场、公告和兑换记录。
- 模型请求使用用户自己的 sub2api API Key；面板会话凭证与模型网关凭证分离保存。
- 管理员控制台、支付操作、任意实例配置，以及托管文件或技能服务不属于当前产品范围。

## 开发环境

要求 Node.js `>=22.13.0 <23`，pnpm `10.33.0`。

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

常用检查：

```bash
pnpm check
pnpm lint
pnpm test
pnpm run build
pnpm test:e2e
```

桌面 E2E 使用临时用户目录，不调用真实模型，也不修改线上账户数据。

## 打包

`pnpm package` 会打包当前桌面平台。Gitee Go 当前提供 [Linux x64 打包流水线](../.workflow/LinuxPackage.yml)，产出 AppImage 和 deb 安装包。

GitHub Actions 提供 [Windows/macOS 打包流水线](../.github/workflows/desktop-packages.yml)。每次运行会将未签名的安装包分别上传为 `naonaoai-windows-installers` 和 `naonaoai-macos-installers` 制品。

构建目录为 `release/build`。Gitee 流水线会将筛选后的 Linux 安装包上传为 `naonaoai-linux-x64` 制品。未完成平台签名的包仅用于内部验收。

## 文档

- [项目状态](../docs/STATUS.md)
- [架构说明](../docs/ARCHITECTURE.md)
- [路线图](../docs/ROADMAP.md)
- [构建与部署](../docs/technical/build-and-deployment.md)
- [English README](../README.md)

## 许可证

本项目遵循 [GPL-3.0 许可证](../LICENSE)。公开分发前仍需完成第三方声明和许可证义务审查。
