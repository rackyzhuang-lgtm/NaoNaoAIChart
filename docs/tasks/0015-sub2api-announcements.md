# 任务 0015：普通用户公告

状态：Done

## 目标

在桌面账户页展示 sub2api 公告并支持用户标记已读，避免为日常通知打开 Web 控制台。

## 已确认事实

- 列表路由为 `GET /api/v1/announcements`，使用面板 JWT，返回当前用户可见公告数组。
- 已读路由为 `POST /api/v1/announcements/:id/read`，只修改当前用户的阅读状态。
- 固定实例当前返回 1 条公告；线上验证只调用 GET，不执行已读写入。

## 范围

- 增加白名单契约、主进程 client、受信 IPC 和 preload typed API。
- 展示标题、正文、发布时间和已读状态，支持单条标记已读及局部失败恢复。
- 不实现公告创建、编辑、删除、用户阅读统计或管理员能力。
- 将工具调用界面的 Chatbox 回退名称替换为产品中性名称。

## 验收

- 契约、client、IPC 和 renderer 定向测试通过。
- TypeScript、变更文件 Biome、生产构建和 `git diff --check` 通过。
- 线上只读验证字段契约，不修改公告阅读状态。

## 验证结果

- 定向 Vitest 9 个文件、61 项通过。
- TypeScript 与 `git diff --check` 通过；变更文件 Biome 0 error，仅保留 preload 既有 `noExplicitAny` warning。
- 使用 8 GB Node 堆的生产构建通过，产物位于 `release/app/dist`；保留既有依赖 `eval`、循环分块、Browserslist 和大 chunk warning。
- 固定实例只读 GET 返回 HTTP 200、`code=0` 和 1 条公告，字段与白名单契约一致；未调用标记已读 POST，未输出公告正文或用户数据。
