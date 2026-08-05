# 项目状态

更新时间：2026-08-05（Asia/Shanghai）

## 当前结论

- 根仓库尚无提交、业务源码或依赖配置；项目协作文档已经建立。
- 当前分支为 `master`。
- `origin` 为 `git@gitee.com:ribbog77/nao-nao-aichart.git`；远程 HEAD 只读检查在 30 秒内超时，连通性待确认。
- 本轮未导入或修改业务代码，只新增协作文档。
- Chatbox + sub2api 的技术集成可行性为“高”，但完整普通用户控制面属于中等偏高工作量，不能等同于只配置一个 OpenAI-compatible 地址。
- 项目所有者已确认：本项目基于 Chatbox 二开，只通过接口对接已经部署的 sub2api；不在客户端仓库中开发或打包 sub2api 后端。
- 本地 `参考原项目源码/` 保存 Chatbox 与 sub2api 的独立克隆，仅用于只读参考，已由根 `.gitignore` 排除，不参与提交或推送。
- 第一批基线任务已经启动，计划保留 Chatbox 完整历史并将 `main` 作为目标默认分支。

## OpenAI Developer Docs MCP

- 初始状态：未配置任何 MCP server，不可用。
- 已执行：`codex.cmd mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`。
- 配置结果：成功添加全局 `openaiDeveloperDocs`。
- 可用性复查：MCP 初始化握手返回 HTTP 403 Forbidden，因此当前会话仍不可用。
- 后续动作：待确认网络/地区/组织策略；环境调整后重启 Codex 并重新执行搜索/抓取测试。

## 本轮分析基线

| 上游 | 默认分支 | SHA | 提交时间（UTC） | 提交说明 |
| --- | --- | --- | --- | --- |
| `chatboxai/chatbox` | `main` | `f90fc31afd634494bdf8f074eca3e38fcf8da740` | 2026-08-02 11:47:11 | `fix: preserve metadata for offloaded tool results (#3827)` |
| `Wei-Shaw/sub2api` | `main` | `00b8596176809906993169c283671811ad04f58d` | 2026-08-04 13:55:34 | `chore: update sponsors` |

由于完整浅克隆在 120 秒超时，本轮通过 GitHub API、raw 文件和 Git 远程 HEAD 读取完成只读分析；未把上游源码写入当前仓库。

## 已完成

- 阅读当前仓库结构、Git 状态、分支、提交和远程。
- 核实 Chatbox 目录、依赖、启动测试命令和 Provider 扩展点。
- 核实 sub2api 目录、依赖、启动测试命令、用户 JWT 控制面和 API Key 网关边界。
- 列出普通用户主要功能与接口范围。
- 建立 `AGENTS.md`、项目文档、ADR 和任务模板。
- 形成阶段路线图和第一阶段技术验证任务。
- 忽略本地上游参考源码目录，并记录其只读用途。

## 未执行

- 未安装项目依赖：当前仓库没有依赖文件。
- 未运行业务测试或启动应用：当前仓库没有业务源码。
- 未修改 Git 分支、远程或提交历史。
- 未连接项目所有者的真实 sub2api 部署。
- 未验证真实支付、OAuth、2FA、Passkey 或模型调用。

## 当前阻塞/待确认

- 已部署 sub2api 的 URL、版本、运行模式和首发认证方式。
- Chatbox Git 历史导入方式和本仓库目标默认分支。
- 首发功能边界及支付/OAuth 外部浏览器策略。
- OpenAI Developer Docs MCP 的 HTTP 403 原因。
- 本仓库 `origin` 的 SSH 连通性和目标默认分支。

## 下一步

正在执行 `docs/tasks/0001-phase-1-foundation.md` 的基线导入与原版验证部分。sub2api 真实实例接入仍需项目所有者后续提供部署与测试信息。
