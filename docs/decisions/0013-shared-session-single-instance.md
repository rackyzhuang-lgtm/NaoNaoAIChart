# ADR-0013：共享 Chromium 会话使用单实例锁

- 状态：Accepted
- 日期：2026-08-09
- 关联任务：`docs/tasks/0037-infinite-canvas-local-storage-path.md`

## 背景

NaoNaoAI Chat 的 renderer 与 Infinite Canvas 共用 Electron `sessionData` 目录。该目录包含 Chromium 的 IndexedDB、quota、localStorage 和缓存等会话数据。先前开发模式跳过了 Electron 单实例锁，多个开发实例会同时写入同一目录，可能导致 quota 数据库无法打开，进而让会话读取显示 `Internal error`。

## 决策

安装版和开发版都调用 `app.requestSingleInstanceLock()`。默认情况下，同一份 NaoNaoAI Chat 共享会话数据仅由一个 Electron 进程持有。第二次启动会交给已运行实例处理，并自行退出。

需要同时调试多个实例时，必须显式使用不同的 Electron 用户数据目录；不得让多个进程共享默认目录。这是调试隔离手段，不改变产品中 Chat 与 Infinite Canvas 使用同一 `sessionData` 的设计。

## 结果

Chat 与 Infinite Canvas 继续共享同一份 Chromium 会话数据，但浏览器 origin 隔离仍然生效。画布不得直接读取主界面的 IndexedDB、聊天内容或凭证；需要共享的模型配置、导入数据等仍经受控主进程 IPC 或桥接消息传递。
