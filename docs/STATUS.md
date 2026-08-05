# 项目状态

更新时间：2026-08-05（Asia/Shanghai）

## 当前结论

- Chatbox Community Edition 基线已导入，保留完整可达历史；基线 SHA 为 `f90fc31afd634494bdf8f074eca3e38fcf8da740`。
- 导入提交为 `59d55feb`；第一批验证提交为 `1ec60fd2`，当前分支为本地 `main`。
- 第一批只处理上游基线、Windows 可移植性和验证，不包含 sub2api 业务接入。
- 项目所有者已确认首发固定连接 `https://naonaoai.shop`；共享常量为 `SUB2API_BASE_URL`，当前不开放任意实例配置。
- 本地 `参考原项目源码/` 仅用于只读参考，已由 `.gitignore`、TypeScript 和 Biome 排除，不参与提交或推送。
- Chatbox + sub2api 的技术集成可行性仍为“高”；账户控制面与模型数据面的鉴权必须分离。
- 尚未连接项目所有者的真实 sub2api 部署，所有真实接口行为、版本和功能开关仍待确认。

## Git 与上游

- `origin`：`git@gitee.com:ribbog77/nao-nao-aichart.git`
- `upstream-chatbox`：`https://github.com/chatboxai/chatbox.git`
- `upstream-sub2api`：`https://github.com/Wei-Shaw/sub2api.git`，仅用于接口变化比较，不合并其源码历史。
- 标签：`checkpoint/docs-bootstrap`、`baseline/chatbox-f90fc31`。
- 当前批次尚未推送；`origin` 的 SSH 连通性和远程默认分支待确认。

## OpenAI Developer Docs MCP

- 全局配置中 `openaiDeveloperDocs` 已启用，地址为 `https://developers.openai.com/mcp`。
- `codex.cmd mcp list` 显示认证状态为 `Unsupported`；当前会话未暴露 `openaiDeveloperDocs` 搜索或抓取工具。
- 结论：配置存在，但当前会话不可调用。网络、地区、组织策略或客户端能力原因待确认；环境调整后需重启 Codex 再复查。

## 第一批验证结果

本机全局 Node `v24.18.0`、pnpm `11.9.0` 不满足上游约束。已在被忽略的 `.toolchain/` 中使用 Node `v22.14.0`、Corepack `0.31.0` 和 pnpm `10.33.0`。

| 项目 | 结果 | 备注 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 通过 | 安装 3,102 个包；使用 npm/Electron 镜像 |
| `pnpm run check` | 通过 | TypeScript 0 error |
| `pnpm run lint` | 通过 | Biome 0 error；保留 901 条上游 warning |
| `pnpm run test` | 通过 | 225 files passed、2 skipped；2,388 tests passed、61 skipped |
| `pnpm run build` | 通过 | main、preload、renderer 均构建成功；存在 chunk 警告 |
| Electron 开发启动冒烟 | 通过 | 进程持续运行 30 秒；随后已停止全部本项目 Node/Electron 进程 |
| `pnpm run test:e2e` | 不可执行 | 脚本引用的 `test/e2e/playwright.config.ts` 不存在，且未锁定 Playwright 依赖 |
| `pnpm run test:model-provider` | 未执行 | 需要显式启用真实模型 API，按项目约束不默认运行 |

## 第一批修复

- 排除本地参考源码目录，避免 TypeScript/Biome 扫描只读克隆。
- 修复上游基线中的 8 个 TypeScript error，不改变既有业务流程。
- 修复 13 个 Biome error；未进行全仓 warning 清理或格式化。
- 修复 Windows 路径分隔符断言、Unix 可执行位断言和迁移测试默认设置 mock。
- Windows 未开启开发者模式或未提权时无法创建目录符号链接；相关逃逸测试按能力跳过，基础授权目录测试仍执行并通过。

## 已知风险

- `epub@1.3.0` 的可选原生依赖 `zipfile@0.5.12` 未能构建 Windows 二进制；运行时会回退到 `adm-zip`，不阻塞构建，但 EPUB 解析性能可能较低。真实 EPUB 导入验收待执行。
- Biome 仍有 901 条上游 warning，当前不阻断构建；后续应按模块渐进治理，不做一次性扫仓。
- E2E 脚本缺少配置和依赖，不能声称桌面 E2E 已通过。
- 本批只在 Windows 验证；macOS、Linux 构建和启动仍待 CI 或对应环境验证。

## 待确认

- 已部署 sub2api 的部署版本/commit、standard/simple 模式和已启用功能。
- 可用于开发的普通用户测试账号、允许创建的测试 API Key 和模型测试额度；秘密信息不得写入仓库。
- 首发是否开放注册，以及 OAuth、2FA、Passkey、支付的范围和外部浏览器策略。
- `origin` 的远程默认分支是否使用 `main`，以及何时允许首次推送。

## 下一步

第一批收口后进入第二批：建立 sub2api API contract 快照、能力矩阵和错误模型，验证公共设置、登录/刷新/当前用户、API Key CRUD 与 `/v1/models` 的真实响应，但暂不开始完整账户 UI。
