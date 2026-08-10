# 任务 0050：同步 Codex 思考强度

- 状态：代码与自动化验证完成，等待真实环境手工验收
- 日期：2026-08-10

## 背景

项目已经支持 OpenAI Responses 的 reasoning effort，但思考强度控件只显示“默认、关闭、低、中、高”，缺少 Codex 使用的 `xhigh` 档位。ProviderOptions schema 已经允许 `xhigh`，但 UI 和通用控制逻辑没有把它暴露出来。

## 修改范围

- 为 GPT-5 系列 OpenAI 和 OpenAI Responses 模型增加 `xhigh` 思考强度选项，中文显示为“极高”。
- 选择“极高”时写入 `openai.reasoningEffort: 'xhigh'`，由 Responses SDK 映射为请求体中的 `reasoning.effort: 'xhigh'`。
- 其他 Provider 仍使用各自支持的低/中/高等级，不将 OpenAI 专属档位误传给其他协议。
- 保留默认/关闭和旧配置读取兼容。

## 验收标准

- [x] GPT-5 系列 OpenAI Responses 思考菜单包含“极高”。
- [x] 选择“极高”后会话设置读写链路保留 `reasoningEffort: 'xhigh'`。
- [x] OpenAI Responses SDK 最终请求体携带 `reasoning.effort: 'xhigh'`。
- [x] 非 OpenAI Provider 及 o-series、GPT-OSS 不显示或发送 `xhigh`；旧配置切换到不支持模型时回落为“默认”。
- [x] Node 22 TypeScript、定向 Vitest、Biome 和 `git diff --check` 通过。
- [ ] 真实线上模型是否接受 `xhigh` 待用户环境手工验收。

## 验证结果

- 定向 Vitest：4 个文件、62 项通过；其中包含 mock 截获 `/v1/responses` 最终 JSON 请求体的断言，未访问真实服务。
- Node 22 TypeScript：通过，0 error。
- 变更文件 Biome：通过，0 error；保留 `SessionSettings.tsx` 3 条既有非空断言 warning。
- `git diff --check`：通过。
- Codex 官方手册抓取因 `developers.openai.com` 返回 HTTP 403 未成功；已注册 OpenAI Developer Docs MCP，但当前会话未动态加载该工具。本次实现依据仓库既有 Provider schema、Responses SDK 能力和本地 Codex 配置档位完成。
- 未执行：真实 API Key 线上模型请求、Electron 界面手工选择/重启持久化验收、打包、Git 推送和 Release 发布。
