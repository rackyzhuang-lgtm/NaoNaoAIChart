# 任务 0014：普通用户模型广场

状态：Done

## 目标

在桌面账户页提供 sub2api 模型广场只读视图，让用户无需打开 Web 控制台即可查看服务端开放的模型组和价格摘要。

## 已确认事实

- sub2api Web 前端使用 `GET /api/v1/model-plaza`。
- 返回说明文本和 `groups`；每个组包含平台、倍率、模型及计费摘要。
- 固定实例当前公开设置为 `model_plaza_enabled=false`，接口返回 HTTP 404；客户端在关闭时不得发起该接口请求。

## 范围

- 增加白名单 zod 契约、主进程 client、受信 IPC 和 preload typed API。
- 增加服务端关闭、加载、失败、空列表、搜索和平台筛选状态。
- 仅展示普通用户需要的模型名、平台、倍率和价格摘要，不暴露管理员渠道或上游账号字段。
- 不实现模型、渠道、分组或价格管理。

## 验收

- 契约、client、IPC 和 renderer 定向测试通过。
- TypeScript、变更文件 Biome、生产构建和 `git diff --check` 通过。
- 线上仅验证公开设置与关闭状态，不修改线上数据。

## 验证结果

- 定向 Vitest：8 个文件、44 项测试通过。
- TypeScript：`corepack pnpm check` 通过。
- 变更文件 Biome：0 error；保留 preload 既有 `noExplicitAny` warning。
- 使用 8 GB Node 堆的生产构建通过，产物在 `release/app/dist`；首次 renderer 构建瞬时退出，重试成功，保留既有构建 warning。
- 真实部署只读验证：公开设置返回 `model_plaza_enabled=false`，`GET /api/v1/model-plaza` 返回 HTTP 404；客户端在开关关闭时不调用该路由，未修改线上数据。
