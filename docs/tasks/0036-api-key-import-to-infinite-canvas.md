# 任务 0036：API Key 导入无限画布

- 状态：Done
- 日期：2026-08-09
- 关联 ADR：ADR-0009、ADR-0010

## 目标

用户在 API Key 列表中选择“导入到无限画布”，选择文本模型、图片模型或视频模型类型后，客户端使用该 Key 请求 `/v1/models`，将返回模型按所选能力导入无限画布并设为该能力的默认模型。

## 安全边界

- 面板 JWT/refresh token 继续只保留在 Electron 主进程。
- 完整 API Key 仅在用户明确点击导入后由主进程读取；renderer 仅短暂持有导入载荷并通过 `postMessage` 交给 loopback 画布桥接。
- 画布桥接只接受结构校验通过的导入消息，不提供 Electron IPC；导入后配置保存在画布自身 localStorage 中，符合用户主动授权行为。

## 功能测试与验收标准

- [x] API Key 列表出现导入按钮，弹窗提供文本、图片、视频三种类型。
- [x] 主进程按所选类型请求模型列表，导入消息中的模型都带对应 capability，默认模型字段正确。
- [x] 无限画布收到导入消息后保存配置并刷新，配置页可看到对应通道、模型和 API Key。
- [x] 非受信 renderer 不能调用导入 IPC；列表和普通读取路径不返回完整 Key。
- [x] 定向 Vitest、TypeScript、Biome、生产构建和 `git diff --check` 执行并如实记录。

## 验证记录

- 定向 Vitest：5 个文件、32 项通过。
- TypeScript：`corepack pnpm exec tsc --noEmit --pretty false` 通过。
- Biome：变更文件无新增 error，保留既有 preload `any` warning。
- 桥接脚本：`node --check assets/infinite-canvas/naonao-embed-bridge.js` 通过。
- `git diff --check`：通过。
- 真实账户的线上模型导入、画布手工冒烟和多平台验证：未执行。
- Git 推送、软件打包和 Release 发布：未执行。
