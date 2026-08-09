# ADR-0012：无限画布本地存储目录

- 状态：Accepted
- 日期：2026-08-09
- 关联任务：`docs/tasks/0037-infinite-canvas-local-storage-path.md`

## 决策

Infinite Canvas 使用浏览器 IndexedDB/localStorage，不能在 iframe 运行时把存储后端切换到任意文件夹。应用提供目录选择器，将用户选择的目录保存到主进程配置，并在下一次启动前调用 Electron `app.setPath('sessionData', selectedPath)`。因此该目录是 Electron Chromium 会话数据目录，包含应用 renderer 的本地存储，不只是无限画布单独的数据。

目录选择不会立即迁移或删除旧数据；用户确认重启后，新会话使用所选目录。路径由系统目录选择器产生，主进程仍会校验绝对路径并在启动时创建目录。

## 容错

本地存储统计是诊断信息，不应阻止画布使用。`navigator.storage.estimate()`、IndexedDB 打开或游标读取失败时返回 0/空数据库，并保留 localforage 自身的 localStorage 回退。
