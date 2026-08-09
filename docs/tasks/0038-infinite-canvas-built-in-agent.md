# Task 0038：无限画布内置 NaoNaoAI Agent

- 状态：进行中
- 日期：2026-08-09

## 目标

无限画布对话只依赖 NaoNaoAI Chat 自身的内置 Agent 网关。用户安装 NaoNaoAI Chat 后，配置聊天文本模型即可在画布中对话，不需要安装 Codex、CCSwitch、canvas-agent 或运行命令。

## 实现范围

- 画布加载前由主应用根据当前默认文本模型自动配置 loopback Agent。
- 从 API Key 导入画布时，优先使用导入的文本模型配置；图片和视频模型仅配置画布对应能力，不作为 Agent 文本模型。
- 主进程持有上游 API Key，画布 iframe 只访问随机 token 保护的 loopback 协议。
- 移除连接面板中的外部插件、npx 命令、Local URL 和 Connect token 手动配置引导，并统一中文错误提示。
- 重建 vendor 静态资源并更新 `assets/infinite-canvas/index.html` 入口。

## 功能测试与验收标准

- 自动配置：存在导入文本模型时优先使用导入配置；否则使用兼容的默认 OpenAI-compatible 文本 Provider；缺失或不兼容配置时明确提示中文配置路径。
- 回退配置：全局 `defaultChatModel` 为空时，从已配置 Provider 的文本模型列表中选择模型，避免用户必须额外设置全局默认值。
- 中断与线程：首次连接自动创建线程，发送后同步线程 ID；停止操作在缺少线程 ID 时仍可中止当前流式请求。
- CSP 与技能：画布入口只加载同源外部脚本；内置网关对 vendor 技能列表请求返回空列表，不将其视为外部 Agent 依赖。
- 对话：模拟 OpenAI SSE 返回文本，网关向 `/v1/chat/completions` 发起流式请求并将回复传回画布协议。
- 安全边界：未携带 loopback token 的请求被拒绝；API Key 不出现在配置查询结果中。
- UI：连接面板只显示内置 NaoNaoAI Agent，不要求任何外部软件或命令。

## 验证记录

- 已执行并通过：9 项定向 Vitest（Agent 网关、配置解析、静态服务器）。
- 已执行并通过：变更范围 Biome 检查（以最终修复后的结果为准）。
- 已执行并通过：使用项目要求的 Node `v22.16.0` 直接运行根 TypeScript 检查；当前默认 Node `v24.14.0` 下 `pnpm check` 在 TypeScript 阶段发生 Windows `0xC0000005`，未将其报告为通过。
- 已执行：vendor `npm run build`，并同步新 hash bundle 与 HTML 入口。
- 未执行：使用真实账户/API Key 的模型对话手工验收；未执行打包、推送或发布。

## 遗留风险

- vendor 上游 `canvas-generation-helpers.ts` 的既有 `node.metadata` 可空错误仍可能阻塞独立 typecheck。
- 真实 Electron 窗口中的登录后画布手工点击验收仍需项目所有者执行或授权后执行。
