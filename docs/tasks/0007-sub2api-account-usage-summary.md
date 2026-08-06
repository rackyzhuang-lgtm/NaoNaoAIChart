# TASK-0007：账户用量与订阅摘要

- 状态：Done
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0006

## 目标

让已登录的普通用户在桌面账户页直接查看 sub2api 的累计/今日用量、实际扣费和当前订阅摘要，继续减少打开 Web 控制台的频率。

## 已确认输入

- 普通用户只读路由为 `/api/v1/usage/dashboard/stats` 与 `/api/v1/subscriptions/summary`。
- 两个接口均使用面板 JWT，不使用用户模型 API Key。
- 响应契约以 sub2api 当前上游路由、handler 和前端类型为依据；真实部署只做只读验证。

## 本批范围

- 增加用量统计和订阅摘要的运行时 schema、typed client 和窄 IPC。
- 在账户页展示累计/今日请求、Token、实际扣费及订阅窗口用量。
- 某一个摘要接口失败时保留已登录账户和其他可用数据，并提供明确的局部错误状态。
- 将可达的 `Bind to Chatbox` 文案改为中性产品动作，并增加回归测试。
- 更新路线图与状态记录。

## 本批非目标

- 支付、订单、兑换码、资料修改或管理员能力。
- 用量明细、错误请求详情、趋势图和模型维度分析。
- 平台限额写入、真实聊天计费请求或线上数据修改。
- sub2api 服务端修改。

## 验收标准

- [x] 用量和订阅请求仅通过主进程面板 JWT 发起。
- [x] renderer 只获得页面需要的只读 DTO，不获得任何令牌。
- [x] 账户页在无订阅、局部接口失败和刷新状态下可用。
- [x] 可达账户流程不再显示 `Bind to Chatbox`。
- [x] 相关测试、TypeScript、Biome、生产构建和 Git 检查完成。
- [x] `docs/STATUS.md` 记录实际验证结果和遗留风险。

## 验证命令

```powershell
pnpm check
pnpm exec biome check <本批变更文件>
pnpm test
pnpm run build
git diff --check
git status --short --branch
```

`pnpm test:model-provider` 与当前缺少基础设施的 `pnpm test:e2e` 不在本批默认范围。

## 完成记录（2026-08-06）

- 新增用量统计、订阅摘要的 zod 契约、主进程 client、受信 IPC 和 preload typed API。
- 账户页新增累计/今日请求、Token、实际扣费和订阅窗口摘要；用量或订阅单独失败时保留另一部分数据。
- 可达 API Key 操作文案由 `Bind to Chatbox` 改为 `Use for chat`，并补充回归断言。
- 定向测试 6 个文件、25 项通过；TypeScript 通过；变更文件 Biome 0 error，仅保留 preload 既有 warning。
- 真实部署只读验证：`usage/dashboard/stats` 与 `subscriptions/summary` 均 HTTP 200、`code=0`，字段名与契约一致；未修改线上数据。
- 生产构建通过并更新 `release/app/dist`。全量 Vitest 运行结果为 227 files passed、3 skipped；8 个套件因本次环境使用 `--ignore-scripts` 后 Electron 二进制下载失败而无法加载，另有既有 Windows `persist-artifact` 2 项断言失败。
