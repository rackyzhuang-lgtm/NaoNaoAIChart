# TASK-0010：分页用量明细只读摘要

- 状态：Done
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0006

## 目标

让普通用户在桌面账户页查看自己的 sub2api 请求用量明细，并通过分页浏览较长记录列表。

## 已确认输入

- 普通用户只读路由为 `/api/v1/usage`，支持 `page` 与 `page_size` 查询参数。
- 固定实例当前测试账号请求返回 HTTP 200、`code=0`，`items` 为空，分页字段为 `total`、`page`、`page_size`、`pages`。
- 普通用户 DTO 可展示模型、请求类型、Token、实际扣费、耗时和创建时间；不使用管理员字段。

## 本批范围

- 增加用量明细 zod schema、主进程 client、受信 IPC 和 preload typed API。
- 账户摘要页展示分页明细，支持上一页/下一页、空列表和局部失败。
- 增加契约、client、IPC、renderer 回归测试，更新翻译、路线图和状态记录。

## 本批非目标

- 不修改、创建或删除任何用量记录、模型、Key、订阅或配额。
- 不实现错误请求详情、支付、兑换码、管理员统计或服务端行为。
- 不暴露面板 JWT、API Key 原文、上游账号或管理员字段。

## 验收标准

- [x] 明细请求只通过主进程面板 JWT 发起，并限制单页大小。
- [x] renderer 仅接收经过 schema 校验的只读 DTO。
- [x] 空列表、局部失败和分页数据均有稳定 UI。
- [x] 定向测试、TypeScript、Biome、生产构建和 Git 检查完成。

## 完成记录（2026-08-06）

- 定向 Vitest：6 个文件、32 项通过。
- TypeScript 检查通过；变更文件 Biome 0 error，仅保留 preload 既有 warning。
- `corepack pnpm exec electron-vite build --mode production` 完成，产物在 `release/app/dist`。
- 固定实例只读验证 `/api/v1/usage?page=1&page_size=20` 返回 HTTP 200、`code=0`、空明细；未修改线上数据。
