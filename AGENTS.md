# AGENTS.md

## 项目目标

本仓库用于长期维护一个基于 Chatbox Community Edition 的桌面 AI 客户端二开项目，并与用户自建的 sub2api 服务集成。目标是让普通用户在桌面软件内完成日常 AI 使用和账户自助操作，减少反复登录 sub2api Web 控制台。

当前仓库已导入 Chatbox Community Edition 基线并完成第一批 Windows 基线验证，尚未开始 sub2api 业务接入。项目所有者已确认：本项目基于 Chatbox 二开，通过 HTTP API 对接已经部署的 sub2api 服务。

## 固定约束

- 目标平台：Windows、macOS、Linux 桌面端。
- 暂不支持：iOS、Android。
- 目标角色：sub2api 普通用户；管理员控制台不在当前产品范围内。
- 目标用户：文职、新媒体、程序员及其他互联网从业者。
- 不得编造接口、配置、测试结果或产品决策；不确定内容标记为“待确认”。
- 不得提交密钥、访问令牌、用户数据或其他秘密信息。ADR-0003 已确认的公开产品服务地址可以作为共享常量提交，其他生产地址仍需项目所有者明确授权。
- 未经明确任务授权，不修改 sub2api 服务端行为，也不把 sub2api 管理员能力暴露给普通用户。

## 开始工作前

按顺序阅读：

1. `docs/STATUS.md`：当前事实、阻塞项和最近进展。
2. `docs/PROJECT.md`：产品目标、范围和成功标准。
3. `docs/ARCHITECTURE.md`：已确认架构和提议中的集成边界。
4. `docs/ROADMAP.md`：阶段计划和验收门槛。
5. `docs/UPSTREAM.md`：上游基线与同步策略。
6. 对应的 `docs/tasks/*.md` 和 `docs/decisions/*.md`。

如果代码事实与文档冲突，以代码和可复现命令为准，并在同一变更中更新文档。

## 工作记录规则

- 任何超过单文件的小改动，都应先创建或更新 `docs/tasks/` 中的任务记录。
- 架构、数据存储、鉴权、上游同步或发布策略发生变化时，必须新增 ADR；不要覆写已接受 ADR 的历史结论。
- 每轮工作结束时更新 `docs/STATUS.md`：已完成、验证结果、遗留风险、下一步。
- 使用绝对事实描述状态。尚未执行的测试不得写成“通过”。
- 业务代码导入后，提交应保持小而可审查；上游同步与产品功能变更分开提交。

## 架构边界

以下边界已经项目所有者确认；具体实现仍以 `docs/decisions/0001-integration-boundary.md` 为准：

- 以 Chatbox 桌面应用作为客户端代码基线。
- sub2api 保持独立部署，桌面端通过公开 HTTP API 集成，不内嵌或复制其后端。
- 明确分离两类凭证：面板 JWT/refresh token 用于 `/api/v1`，用户 API Key 用于模型网关 `/v1` 等端点。
- 账户令牌优先由 Electron 主进程持有，并通过窄 IPC 接口向 renderer 提供能力，避免在 renderer 的 `localStorage` 中长期保存敏感令牌。该安全实现仍待技术验证。
- 优先复用 Chatbox 的 Provider、平台适配和设置架构，不直接移植 sub2api 的 Vue 页面。

## 多 Agent 协作

进入开发阶段后，可按用户要求使用多 Agent，但必须遵守：

- 主 Agent 负责计划、任务拆分、集成、冲突处理、代码审查和最终验证。
- 子 Agent 只处理边界清晰、文件所有权不重叠的任务，不自行合并、不扩大范围。
- 每个子任务要有输入、允许修改的路径、验收命令和输出说明。
- 主 Agent 必须检查所有 diff，并运行与整体变更风险相匹配的测试；不能只接受子 Agent 的口头结论。
- 鉴权、凭证存储、支付、升级和上游同步属于高风险区域，至少需要独立复核。

## 验证命令

最低验证为：

```powershell
git diff --check
git status --short --branch
```

Chatbox 要求 Node `>=22.13.0 <23`、pnpm `>=10.17.0`，锁定 pnpm `10.33.0`。常规验证命令：

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm run build
```

`test:e2e` 使用仓库锁定的 Playwright 版本，先构建生产产物，再用临时用户目录执行桌面启动烟测。不得用 `npx` 临时下载未锁定版本；真实模型 Provider 测试仍不属于该 E2E 烟测。

不得默认运行 `pnpm test:model-provider`，它是需要显式启用真实模型 API 的集成测试。

## 上游纪律

- Chatbox 上游：`https://github.com/chatboxai/chatbox`
- sub2api 上游：`https://github.com/Wei-Shaw/sub2api`
- 同步前先阅读 `docs/UPSTREAM.md`，记录同步前后 SHA、冲突和验证结果。
- 不对上游生成文件、锁文件或大规模格式化结果做无关修改。
- 许可证义务必须在首次分发前完成审查；当前已确认 Chatbox 为 GPL-3.0，sub2api 为 LGPL-3.0。
