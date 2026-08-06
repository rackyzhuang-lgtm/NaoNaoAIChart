# TASK-0006：移除 Chatbox 运行时网络调用与用户界面字样

- 状态：Completed (legacy compatibility code retained)
- 负责人：主 Agent
- 关联 ADR：ADR-0004、ADR-0007

## 目标

让 NaoNaoAI Chat 的默认运行路径不再访问 Chatbox 自有服务，也不再向用户展示 Chatbox AI、Chatbox 官网、上游更新/遥测入口；保留必要的上游兼容类型和历史迁移读取。

## 范围

- 禁止启动时 Chatbox 远程配置、版本检查和 Chatbox AI 模型目录请求。
- 从默认 Provider、设置菜单和首页新会话推荐中移除 Chatbox AI。
- 移除 HTML 中 Chatbox/Plausible/Google 远程脚本入口。
- 将 About 页面改为 NaoNaoAI Chat 自有文案和固定公开服务地址。
- 增加回归测试或静态审计，证明默认路径不调用 Chatbox 远程服务。

## 非目标

- 不删除旧配置迁移所需的 Chatbox provider enum、schema 或历史错误类型。
- 不删除第三方模型 Provider 的用户主动配置能力。
- 不修改 sub2api 服务端。

## 验收标准

- [x] 默认启动和 Provider 列表不触发 Chatbox 服务请求。
- [x] 用户可见设置、首页默认模型和 About 页面不再出现 Chatbox 品牌入口。
- [x] TypeScript、相关测试、Biome、生产构建通过。
- [x] 文档记录保留的兼容代码与剩余外部网络边界。

## 实际结果

- Disabled hosted model manifests, remote config/version checks, telemetry scripts, hosted onboarding, hosted document/link parsing, built-in hosted web search, builtin skill sync, and hosted MCP config creation.
- Removed or replaced visible hosted login, upgrade, FAQ, and export branding CTAs. Legacy enum/schema/parser values remain readable but are unavailable and do not trigger network calls.
- Third-party providers, user-configured sub2api/OpenAI-compatible requests, MinerU, Bing, Tavily, BoCha, and Querit remain user-initiated network boundaries.
- Validation: direct TypeScript compiler passed; targeted and initialization/migration Vitest coverage passed; full Vitest passed 235 files / 2,417 tests with 61 skipped and only the pre-existing Windows `persist-artifact` path assertions failing; direct `electron-vite` production build and `git diff --check` passed with existing build warnings.
