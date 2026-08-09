# ADR-0014：无限画布使用 NaoNaoAI Chat 内置 Agent

- 状态：Accepted
- 日期：2026-08-09
- 关联任务：`docs/tasks/0038-infinite-canvas-built-in-agent.md`

## 背景

无限画布原有连接面板按外部 Codex Agent 设计，要求用户安装插件或运行额外命令。NaoNaoAI Chat 已经拥有模型 Provider、API Key 和 Electron 主进程边界，重复要求用户配置外部 Agent 会导致“Agent 已连接但无法对话”。

## 决策

在 NaoNaoAI Chat 主进程内运行 Canvas Agent loopback 网关：

```text
无限画布 iframe -> 127.0.0.1 随机 token -> 内置 Agent 网关 -> 当前 OpenAI-compatible 文本模型
```

- renderer 在画布 iframe 加载前，从当前设置或待导入文本模型解析配置，并通过窄 IPC 调用主进程配置网关。
- API Key 只在主进程网关会话内使用，不通过 `/config`、HTML、iframe URL 或连接面板返回。
- iframe 只获得随机 loopback endpoint/token；vendor 协议中的 `/agent/codex/*` 路径保留为兼容协议名称，不代表依赖 Codex 软件。
- 连接面板不再展示外部插件、CCSwitch、npx 命令、Local URL 或 Connect token 手动配置。

## 后果

- 用户只需安装并配置 NaoNaoAI Chat，即可使用无限画布 Agent。
- 网关需要维护 SSE 转换、会话状态、工具调用和取消逻辑；真实模型请求仍受 Provider 可用性和网络影响。
- 画布不能直接读取主应用凭证。模型切换需通过主应用设置并重新连接画布生效。
