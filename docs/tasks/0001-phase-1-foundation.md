# TASK-0001：第一阶段基线与集成验证

- 状态：In Progress
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0002

## 目标

建立可维护的 Chatbox 代码基线，并证明桌面端可以安全完成 sub2api 登录、API Key 管理和真实流式模型调用。

## 前置条件

- Chatbox 导入策略采用：保留完整上游历史，以 `main` 作为目标默认分支。
- 提供可用于开发的 sub2api 测试实例、普通用户测试账号和允许测试的模型额度；秘密信息不得提交到仓库。

## 执行记录

- 2026-08-05：开始第一批基线任务。
- Chatbox 本地参考基线：`f90fc31afd634494bdf8f074eca3e38fcf8da740`，分支 `main`，工作区干净。
- sub2api 本地参考基线：`00b8596176809906993169c283671811ad04f58d`，分支 `main`，工作区干净。
- 当前全局运行时为 Node `v24.18.0`、pnpm `11.9.0`；Chatbox 要求 Node 22、pnpm 10，需使用兼容运行时后再安装依赖。
- 多 Agent：主 Agent 负责导入、合并和验收；三个 `gpt-5.6-terra` 工作 Agent 分别审计 Git 导入、构建前置条件和文件冲突。
- 已创建 bootstrap 提交 `496e5f79`、Chatbox 基线标签 `baseline/chatbox-f90fc31` 和导入合并提交 `59d55feb`；本地 `main` 已建立。
- 已使用被忽略的本地工具链 Node `v22.14.0`、Corepack `0.31.0`、pnpm `10.33.0` 完成冻结锁文件安装。
- 已修复上游基线的 TypeScript/Biome 阻断错误和 Windows 测试可移植性问题；主 Agent 审查后保留 symlink 基础路径覆盖。
- 全量验证：TypeScript 0 error；Biome 0 error、901 warnings；Vitest 225 files passed、2 skipped，2,388 tests passed、61 skipped；生产构建通过；Electron 开发进程持续运行 30 秒后已清理。
- `test:e2e` 当前缺少配置和 Playwright 锁定依赖，不可执行；`test:model-provider` 按约束未运行。
- `zipfile@0.5.12` 是 `epub@1.3.0` 的可选原生加速依赖，Windows 构建失败后回退 `adm-zip`，记录为非阻塞风险。

## 范围

- 导入并验证 Chatbox 基线。
- 建立 sub2api typed API client 和 contract fixture。
- 服务地址配置、URL 校验和连接测试。
- 登录、refresh、logout、当前用户。
- API Key 列表、创建、更新、删除和默认选择。
- Provider 自动配置、模型列表和流式对话 E2E。
- 最小账户状态 UI；不追求完整视觉功能。

## 非目标

- 支付、退款、Passkey、全部 OAuth、推广返利、批量图片。
- 管理员能力。
- iOS、Android。

## 建议多 Agent 拆分

- Agent A：Chatbox 基线、构建和上游同步准备。
- Agent B：sub2api contract、typed client、错误和能力模型。
- Agent C：账户 UI、Provider 绑定和 E2E 场景。
- 主 Agent：任务拆分、共享接口先行、集成、代码审查、安全复核和最终测试。

实际拆分必须避免文件所有权重叠；由主 Agent 在开发开始时细化。

## 验收标准

- [x] Chatbox 基线的安装、类型检查、lint、默认测试、生产构建和 Windows 启动冒烟通过。
- [ ] 可配置并验证 sub2api HTTPS 地址。
- [ ] access token 过期时只有一次 refresh 请求，失败后安全退出。
- [ ] renderer 无法通过通用接口读取 refresh token。
- [ ] 用户能管理自己的 API Key。
- [ ] 用户选择 Key 后可以读取 `/v1/models` 并完成流式对话。
- [ ] 错误、断网和服务端关闭功能有可恢复 UI。
- [ ] 文档、ADR、状态和测试结果同步更新。

## 验证命令

当前实际验证命令：

```powershell
pnpm check
pnpm lint
pnpm test
pnpm run build
git diff --check
```

`pnpm test:e2e` 待补齐配置和锁定依赖后再纳入门禁；不得使用 `npx` 临时下载未锁定版本来伪造通过结果。

## 风险与待确认

- sub2api 暂未确认稳定 OpenAPI 规格，需要自行维护 contract fixture。
- 真实部署的版本、功能开关、CORS 和支付/OAuth 配置未知。
- 操作系统安全凭证存储方案需要技术 spike。
