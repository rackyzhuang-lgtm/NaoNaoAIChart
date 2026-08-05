# ADR-0004：品牌发行与更新服务隔离

- 状态：Accepted
- 日期：2026-08-05
- 决策者：项目所有者、主 Agent

## 背景

第二批将桌面产品命名为 `NaoNaoAI Chat`。Chatbox 基线仍包含上游发布 bucket、自动更新 API、应用标识和深链接协议。若品牌版本继续查询或发布到上游更新服务，可能下载不属于本项目的安装包，或者误向上游基础设施发布产物。

## 决策

1. 桌面产品名、窗口标题、托盘、菜单、启动项和构建图标改为 `NaoNaoAI Chat`。
2. 移除 `electron-builder.yml` 中的 Chatbox 上游 publish 配置。
3. 在 NaoNaoAI 自有更新地址、签名和回滚流程确认前，不执行自动或手动更新检查；`AppUpdater` 缺少 feed URL 时明确返回“未配置”。
4. 暂时保留 `xyz.chatboxapp.app`、`chatbox://`/`chatbox-dev://` 和 npm package name，避免在没有迁移设计时破坏既有用户数据目录、深链接与安装升级关系。它们不是最终品牌决策，状态为“待确认”。
5. Chatbox Provider、Chatbox AI 云服务兼容代码和上游源码中的技术名词不做全仓替换。
6. 未配置自有发布通道前，现有 Electron 发布脚本固定使用 `--publish never`，仓库元数据指向本项目 `origin`，不得保留 Chatbox 上游仓库作为发布推断来源。

## 影响

- 当前构建不会从 Chatbox 上游自动下载或安装更新，也不会由默认打包命令发布到其 bucket。
- 更新设置在自有服务接入前不可用；第三阶段前必须补充自有 feed、签名、公钥校验、灰度与回滚方案。
- 最终 `appId` 与深链接协议迁移需要单独 ADR，并验证 Windows/macOS/Linux 的用户数据与升级兼容性。
- 项目所有者已于 2026-08-06 提供无可见水印的新 `logo.png`，构建图标资产已同步重新生成。
