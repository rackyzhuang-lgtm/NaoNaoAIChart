# 任务 0013：普通用户可用渠道

状态：Done

## 目标

在桌面账户页展示 sub2api 用户可见的渠道监控状态，帮助用户判断模型调用是否可用；不开放管理员渠道配置或写操作。

## 已确认事实

- 只读路由为 `GET /api/v1/channel-monitors`，使用面板 JWT。
- 返回 `items`，每项包含渠道名称、平台、主模型、当前状态、延迟、7 日可用率和可选时间线。
- 公开设置中的 `available_channels_enabled` 当前为 `false`；客户端必须显示服务端未开放状态，不把监控信息误认为可配置渠道。

## 范围

- 增加 zod 契约、主进程 client、受信 IPC 和 preload typed API。
- 账户页增加渠道状态列表、状态徽章、可用率和刷新/空态/失败态。
- renderer 只接收白名单 DTO，不暴露令牌、管理字段或原始请求上下文。
- 不实现渠道创建、编辑、删除、启停或管理员监控。
- 删除主进程中遗留的 Chatbox 托管技能同步网络实现；内置技能仅使用随包种子，并将工具界面的 `Chatbox Version` 改为 `App Version`。

## 验收

- 定向契约、client、IPC、renderer 测试通过。
- `pnpm check`、变更文件 Biome 和生产构建通过。
- 线上仅执行登录后的 `GET /api/v1/channel-monitors` 与公开设置读取，不修改线上数据。

## 验证结果

- 定向 Vitest：9 个文件、56 项测试通过。
- TypeScript：`corepack pnpm check` 通过。
- 变更文件 Biome：0 error；保留 `src/preload/index.ts` 既有 `noExplicitAny` warning。
- 生产构建：设置 `NODE_OPTIONS=--max-old-space-size=8192` 后执行 `corepack pnpm exec electron-vite build --mode production` 通过，产物在 `release/app/dist`。默认堆重建曾在 renderer 分块阶段出现一次 V8 原生崩溃，未复现于 8 GB 堆构建。
- 真实部署只读验证：公开设置返回 `available_channels_enabled=false`、`channel_monitor_enabled=true`；登录后渠道监控接口返回 HTTP 200、`code=0` 和 3 条记录，字段与本批 schema 一致；未修改线上数据。
