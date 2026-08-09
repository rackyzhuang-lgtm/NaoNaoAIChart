# ADR-0011：用户主动导入 API Key 到无限画布

- 状态：Accepted
- 日期：2026-08-09
- 关联任务：`docs/tasks/0036-api-key-import-to-infinite-canvas.md`

## 决策

API Key 列表提供明确的“导入到无限画布”操作。主进程读取所选 Key 并请求 `/v1/models`，renderer 只在该操作的短生命周期内接收导入载荷，随后通过 loopback iframe 的受控 `postMessage` 交给嵌入桥接。桥接将通道配置写入 Infinite Canvas 的 `infinite-canvas:ai_config_store`，并刷新画布以完成 Zustand 持久化状态加载。

导入是用户主动授权，允许画布自身 localStorage 持有该 Key；面板 JWT、refresh token 和其他账户凭证仍不得进入 iframe。模型列表没有统一 capability 字段时，用户选择的文本、图片或视频类型作为本次导入模型的 capability。

## 影响

画布配置页可以直接使用导入的通道和自动发现的模型。用户需要在画布配置中管理或删除已导入 Key；应用退出时不额外复制该配置。
