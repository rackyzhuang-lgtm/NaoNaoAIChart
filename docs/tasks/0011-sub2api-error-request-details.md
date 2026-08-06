# TASK-0011：错误请求列表与详情只读摘要

- 状态：Done
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0006

## 目标

让普通用户在桌面账户页查看自己失败请求的脱敏列表，并点击单条记录查看服务端允许公开的错误详情。

## 已确认输入

- 列表路由为 `/api/v1/usage/errors`，详情路由为 `/api/v1/usage/errors/:id`。
- 两个接口使用面板 JWT；服务端通过用户错误查看开关 fail-closed，当前固定实例返回 HTTP 403，客户端必须稳定显示不可用状态。
- 用户列表 DTO 白名单包含时间、模型、入口、状态码、分类、平台、消息、Key 名称、请求类型和流式标记；详情额外包含错误正文和上游状态码。

## 本批范围

- 增加错误请求列表/详情 zod schema、主进程 client、受信 IPC 和 preload typed API。
- 在账户摘要页展示分页错误列表，支持选择单条记录打开详情、空列表和接口关闭/失败状态。
- 增加契约、client、IPC、renderer 回归测试，更新翻译、路线图和状态记录。

## 本批非目标

- 不显示或传递管理员字段、上游账号凭证、API Key 原文或内部错误上下文。
- 不修改、重试、删除或创建错误请求，不修改 sub2api 服务端开关。
- 不实现支付、兑换码、渠道管理或管理员统计。

## 验收标准

- [x] 错误列表和详情请求只通过主进程面板 JWT 发起，并限制分页/详情 ID。
- [x] renderer 仅接收经过 schema 校验的脱敏 DTO。
- [x] 403、其他失败、空列表和详情弹窗均有稳定 UI。
- [x] 定向测试、TypeScript、Biome、生产构建和 Git 检查完成。

## 验证记录

- 定向 Vitest：6 个文件、34 项通过。
- TypeScript：通过。
- 变更文件 Biome：0 error；保留 `src/preload/index.ts` 既有 `noExplicitAny` warning。
- 生产构建：`corepack pnpm exec electron-vite build --mode production` 通过，产物在 `release/app/dist`。
- 真实部署只读验证：`GET /api/v1/usage/errors?page=1&page_size=20` 返回 HTTP 403；客户端显示服务端未开放错误请求查看，不修改服务端开关。
