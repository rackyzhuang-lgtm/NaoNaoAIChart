# 上游维护说明

## 当前 Git 状态

截至 2026-08-06：

- 第二批开发分支：`codex/batch-2-contract-login`
- 第二批从本地 `main` 的 `5011363a`（固定 sub2api 地址）开始，验收后 fast-forward 合入本地 `main`
- `origin`：`git@gitee.com:ribbog77/nao-nao-aichart.git`
- `upstream-chatbox`：`https://github.com/chatboxai/chatbox.git`
- `upstream-sub2api`：`https://github.com/Wei-Shaw/sub2api.git`
- 项目所有者已确认 `origin` SSH 配置完成；本地 `main` 的第二批及后续品牌资产更新推送至 `origin/main`

Chatbox 导入提交保留 `f90fc31afd634494bdf8f074eca3e38fcf8da740` 和 bootstrap 提交 `496e5f79` 的可达历史。sub2api 不导入、不 vendoring。

## 外部上游

### Chatbox

- URL：`https://github.com/chatboxai/chatbox`
- 默认分支：`main`
- 分析基线：`f90fc31afd634494bdf8f074eca3e38fcf8da740`
- 许可证：GPL-3.0
- 用途：已确认的桌面客户端代码基线

### sub2api

- URL：`https://github.com/Wei-Shaw/sub2api`
- 默认分支：`main`
- 分析基线：`00b8596176809906993169c283671811ad04f58d`
- 许可证：LGPL-3.0
- 用途：已部署的远程服务端及 API 行为参考；不 vendoring，不合并其源码历史

## 当前 remote 布局

已配置：

```powershell
git remote add upstream-chatbox https://github.com/chatboxai/chatbox.git
git remote add upstream-sub2api https://github.com/Wei-Shaw/sub2api.git
```

`upstream-sub2api` 只用于检查接口和发布变化，不把两个 Git 历史合并。Chatbox 已按 ADR-0002 保留完整历史，目标默认分支为 `main`。

## 首次导入记录

- Chatbox 旧/新 SHA：空仓库 -> `f90fc31afd634494bdf8f074eca3e38fcf8da740`
- bootstrap 提交：`496e5f79`
- 导入合并提交：`59d55feb`
- 冲突：仅 `.gitignore`；采用并集并保留 `/参考原项目源码/`
- 验证：Node 22/pnpm 10 安装、TypeScript、Biome、Vitest、生产构建和 Windows Electron 进程级启动冒烟通过
- 未验证：macOS/Linux、安装包、签名、自动更新、桌面 E2E

## 同步策略

1. 在独立同步分支抓取并记录上游旧/新 SHA。
2. 先合并纯上游变化，不夹带本项目功能开发。
3. 重点检查 Provider、设置路由、OAuth、主进程 IPC、构建配置和持久化迁移冲突。
4. 运行类型检查、lint、单测、集成测试和桌面 E2E。
5. 再把同步结果合入产品分支，并更新 `docs/STATUS.md`。

sub2api API 变化不直接合并代码，而是：

1. 刷新 API contract fixture 和能力矩阵。
2. 比较路由、DTO、鉴权、错误码和 feature flag。
3. 在适配层做向后兼容，必要时声明最低支持版本。
4. 用至少一个旧版和一个目标版实例运行契约测试。

## 许可证注意事项

- Chatbox README 明确 Community Edition 使用 GPLv3。分发修改版桌面应用前，需要确认源码提供、版权声明、许可证文本和安装包内第三方声明等义务。
- sub2api GitHub 元数据显示 LGPL-3.0。计划通过 HTTP API 交互，优先自行实现客户端适配，不复制其 Vue 页面或大量源码。
- 最终商标、品牌、图标、更新服务和发布渠道是否可沿用，尚未审查，标记为“待确认”。
- 本文不是法律意见；正式商业发布前需要许可证与品牌合规复核。

## 已发现的上游不一致

- sub2api `backend/go.mod` 与当前 CI 使用 Go 1.26.5。
- sub2api README 和 DEV_GUIDE 仍出现 Go 1.25.7、Go 1.21+ 等旧说明。
- 开发和 CI 应以 `go.mod`、lockfile 和当前 workflow 为准，不复制旧版本描述。
