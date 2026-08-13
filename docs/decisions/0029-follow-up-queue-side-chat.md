# ADR-0029：本地跟进队列、步骤边界调整方向与隐藏 Side Chat

- 状态：Accepted
- 日期：2026-08-12
- 决策者：项目所有者、主 Agent

## 背景

现有桌面客户端已经通过固定 NaoNaoAI 网关进行严格的单次 request-ID 派发，并在 renderer 内实现按会话隔离、完整串行的 `1 + 5` 生成重试。新增跟进消息能力必须允许用户在生成中继续组织输入，但不能通过隐式重发、并行发送或底层重试增加费用，也不能要求修改 sub2api。

知识库的 `turn/steer` 描述了本地 app-server 的真实活动 Turn 注入协议，但当前项目使用 AI SDK 和固定 Responses HTTP/SSE 网关，并不运行该 app-server。官方 Responses WebSocket 模式同样只允许一个连接上顺序执行 `response.create`，没有等价的 `turn/steer`。因此不能把知识库协议名称直接映射为不存在的服务端能力。

## 决策

### 本地状态和隔离

- 使用现有会话存储，不新增远程 API、WebSocket或数据库服务。
- 全局设置新增 `followUpBehavior: queue | steer`，默认 `queue`；会话可保存覆盖值。
- 旧会话缺少 `activeThreadId` 时回退到 `session.id`，队列作用域为 `sessionId + activeThreadId`。
- 会话 `followUpState` 保存队列项和 Side Chat 链接。队列项包含稳定 ID/分支 ID、正文、附件引用、意图、状态、Plan/Goal、Provider/模型/推理、Agent/执行权限/工作目录/联网快照和时间戳。
- 队列写入使用现有原子 session updater；仅修改队列时不推进 `lastActivityAt`。

### 排队和生命周期

- 活动生成中按 Enter 默认只入队，队列为 FIFO；用户可编辑、删除和拖拽排序。
- 应用启动把残留 `ready/dispatching` 项统一转为 `paused`。停止、导航、renderer 销毁、线程切换和退出也只暂停，不自动发送。
- 队列项在其触发的生成终态前不删除，以便中断和恢复可判定。
- “关闭排队”只把当前会话切换为调整方向，既有队列不删除。
- 每个成功持久化的入队项登记独立 wake key；wake 排在同一会话生成锁尾部，防止终态 drain 与同时入队交错造成悬空。多个 wake 可重复 drain，但原子 claim 保证一个队列项只派发一次。
- 启动扫描只更新确有 `followUpState` 且存在非暂停工作的会话，避免给未使用功能的历史会话写空状态或放大首屏 I/O。

### 调整方向和立即发送

- 调整方向只在 AI SDK 下一次 `prepareStep` 边界注入，避免修改正在传输的 HTTP/SSE 正文。
- 若本次生成没有下一步骤，调整方向在当前 attempt 终态后成为最高优先级待发消息。
- 若生成处于 retry backoff，调整方向取消尚未开始的旧重试续链；必须等上一 attempt 进入终态后，才以新 request ID 发送新方向。
- 立即发送必须二次确认，取消当前请求并等待已确认的取消终态，然后再发送；取消不确定时不发送且保留队列项。

### Side Chat

- 从队列消息创建一个本地隐藏关联会话，源会话不追加或修改消息；Side Chat 关闭时仅隐藏，重新打开恢复。
- 一个源会话可拥有多个 Side Chat；会话头部入口列出全部有效关联会话，重开本身不启动请求。
- 宽度不小于 900px 时使用右侧可调整面板，默认 420px、最小 360px、最大视口 50%；窄屏使用带返回操作的全屏视图。
- 复制附件时生成新的会话和消息 ID，并通过现有 session attachment RAG controller 重建索引。任一步失败时不生成部分可发送的 Side Chat。
- 隐藏会话及其附件仍进入现有完整备份/恢复路径，但不显示在常规会话列表。
- 源会话/线程是 Side Chat 的所有者。永久删除、线程移除和清空完成父状态变更后再清理有效的 `hidden chat` 子会话；父状态变更失败时不先删除子数据。子清理时保留所有权链接直至删除成功，失败数据保持可达并可补偿。
- 队列项删除、线程移除和成功转入 Side Chat 后按源 `messageId` 精确回收草稿附件 RAG；后台维护仍负责异常补偿。

### 请求协议不变量

- 保留 `withSessionGenerationLock`、`runSessionScopedGenerationRetry`、固定 HTTP/SSE 和 request-ID tombstone 协议。
- 每个 attempt 使用新 request ID；上一 attempt 未进入终态时禁止下一 attempt。
- 自动重试仍为一次初始请求加最多五次重试，并按 `sessionId + assistantMessageId` 隔离。
- 排队不调用 Provider；同一会话串行，不同会话和 Side Chat 可并发。
- 不引入底层自动 retry、响应重放、能力探测请求、延迟网关派发或隐藏续发。

## 备选方案

- 新增 WebSocket：拒绝。现有服务端未提供等价 steering 协议，且会扩大 sub2api 和传输范围。
- 生成中直接并行发送：拒绝。会破坏同会话锁、上下文顺序和费用不变量。
- 取消后立即乐观续发：拒绝。取消终态不明确时会导致两个请求同时在服务端运行。
- 只在内存保存队列：拒绝。无法满足重启可恢复和明确暂停语义。
- 复制源会话并复用附件索引：拒绝。消息/会话 ID 改变会造成 RAG 隔离和删除引用错误。

## 影响

- 收益：用户可在生成期间继续组织工作，且排队本身无费用；每个窗口、线程和 Side Chat 都有清晰隔离。
- 成本：需要新的持久化状态机、生命周期暂停处理、步骤边界消费、隐藏会话布局和附件重建测试。
- 风险：流式消息和队列状态的并发写入、取消确认、重试退避抢占以及隐藏会话备份是主要回归点。
- 回滚：隐藏入口并关闭队列消费即可停止自动处理；持久化字段均为可选，旧客户端可忽略，正常消息和会话内容不迁移或改写。

## 验证

- 单元测试覆盖队列状态转换、重启暂停、原子更新、FIFO/优先级、retry backoff 抢占和取消终态。
- UI 测试覆盖生成中 Enter、编辑/删除/排序、关闭排队、确认立即发送和宽窄 Side Chat。
- 集成测试断言排队零请求、成功一次请求、`1 + 5` 上限、attempt ID 唯一、同会话串行和跨会话并发。
- 备份/附件测试断言隐藏 Side Chat、队列附件和新 RAG 索引在恢复后隔离且完整。
- 执行 TypeScript、Biome、全量 Vitest、生产构建、`git diff --check` 和 Git 状态检查。

## 待确认

- 无。项目所有者已经确认本 ADR 覆盖的产品语义；macOS 实机结果将在具备对应环境后补充。
