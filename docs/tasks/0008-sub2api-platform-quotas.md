# TASK-0008：平台配额只读摘要

- 状态：Done
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0006

## 目标

让普通用户在桌面账户页查看 sub2api 为各模型平台配置的日/周/月额度、当前使用量和窗口重置时间。

## 已确认输入

- 普通用户只读路由为 `/api/v1/user/platform-quotas`。
- 接口使用面板 JWT；当前测试账号返回空的 `platform_quotas` 列表。
- 当前上游契约的平台字段为 `platform`、三组 `*_limit_usd`、`*_usage_usd` 和可选窗口重置时间。

## 本批范围

- 增加平台配额 zod schema、typed client、受信 IPC 和 preload API。
- 在账户摘要页展示各平台额度进度、已用金额和重置时间。
- 明确显示未配置配额；该接口失败时保留用量和订阅摘要。
- 增加契约、client、IPC 和 renderer 回归测试，并更新路线图与状态记录。

## 本批非目标

- 修改、重置或创建平台配额。
- 用量明细、趋势、模型分析、支付、兑换码或管理员接口。
- sub2api 服务端修改和真实模型调用。

## 验收标准

- [x] 平台配额请求仅通过主进程面板 JWT 发起。
- [x] renderer 只获得只读 DTO，不获得令牌或管理员操作。
- [x] 空列表、局部失败和窗口无上限状态均有稳定 UI。
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

- 新增平台配额 zod schema、面板 client、受信 IPC 和 preload typed API。
- 账户摘要页展示 OpenAI、Anthropic、Gemini、Antigravity、Grok 等平台的日/周/月额度、已用金额、无上限/禁用状态和重置时间。
- 定向测试 6 个文件、27 项通过；TypeScript 通过；变更文件 Biome 0 error，仅保留 preload 既有 warning。
- 固定实例只读验证 `/api/v1/user/platform-quotas` 返回 HTTP 200、`code=0`，测试账号当前为 0 条配额；未修改线上数据。
- `corepack pnpm exec electron-vite build --mode production` 通过，产物更新至 `release/app/dist`；保留既有 eval、循环依赖和大 chunk 警告。
