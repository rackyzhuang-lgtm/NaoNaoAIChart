# TASK-0009：用量趋势与模型维度只读摘要

- 状态：Done
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0006

## 目标

让普通用户在桌面账户页查看 sub2api 最近 7 天的用量趋势和模型维度汇总，减少打开 Web 控制台的需要。

## 已确认输入

- 只读路由为 `/api/v1/usage/dashboard/trend?period=week` 与 `/api/v1/usage/dashboard/models?period=week`。
- 两个接口使用面板 JWT，返回 `code=0` 的数据包；当前测试账号两者均返回空数组。
- 趋势项包含日期、请求数、Token、标准费用和实际扣费；模型项包含模型名、请求数、Token、标准费用和实际扣费。

## 本批范围

- 增加趋势和模型统计 zod schema、主进程 client、受信 IPC 和 preload typed API。
- 在账户摘要页展示最近 7 天趋势和模型用量；空列表和局部失败均有稳定 UI。
- 增加契约、client、IPC、renderer 回归测试，更新中英文翻译、路线图和状态记录。

## 本批非目标

- 不修改、创建或删除任何用量记录、模型、Key、订阅或配额。
- 不实现分页明细、错误请求详情、支付、兑换码或管理员统计。
- 不发起真实模型调用，不把面板 JWT 暴露给 renderer。

## 验收标准

- [x] 趋势和模型请求只通过主进程面板 JWT 发起。
- [x] renderer 仅接收经过 schema 校验的只读 DTO。
- [x] 空列表、局部失败和正常数据均有稳定 UI。
- [x] 定向测试、TypeScript、Biome、生产构建和 Git 检查完成。

## 完成记录（2026-08-06）

- 定向 Vitest：6 个文件、30 项通过。
- TypeScript 检查通过；变更文件 Biome 0 error，仅保留 preload 既有 warning。
- `corepack pnpm exec electron-vite build --mode production` 完成，产物在 `release/app/dist`。
- 固定实例两个只读接口均 HTTP 200、`code=0`，测试账号返回空数组；未修改线上数据。

## 验证命令

```powershell
pnpm check
pnpm exec biome check <本批变更文件>
pnpm test -- src/shared/sub2api/contracts.test.ts src/main/sub2api/client.test.ts src/main/sub2api/ipc-handlers.test.ts src/renderer/components/settings/Sub2ApiUsageSummary.test.tsx
corepack pnpm exec electron-vite build --mode production
git diff --check
git status --short --branch
```
