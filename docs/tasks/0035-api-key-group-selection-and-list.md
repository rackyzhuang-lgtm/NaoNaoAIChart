# 任务 0035：API Key 分组选择与列表精简

- 状态：Done
- 日期：2026-08-09
- 关联 ADR：ADR-0001、ADR-0005、ADR-0006

## 目标

修复普通用户 API Key 的创建和修改流程，使其按“密钥名称 -> 获取分组 -> 设置分组 -> 保存/修改”完成；列表只展示密钥名称、脱敏密钥及复制操作、用量。

## 已确认接口依据

- 上游 sub2api 用户路由注册 `GET /api/v1/groups/available`，由普通用户 JWT 认证，明确不是管理员路由。
- 上游 `POST /api/v1/keys` 与 `PUT /api/v1/keys/:id` 均支持可空 `group_id`。
- 上游 `GET /api/v1/keys/:id` 会返回完整密钥。列表、创建和更新 IPC 继续只返回脱敏摘要。

## 实施边界

- 仅接入普通用户可用分组，不增加管理员分组管理能力，也不修改 sub2api 服务端。
- “复制密钥”由主进程读取单个密钥后直接写入系统剪贴板；完整密钥不得经 IPC 返回 renderer。
- 不对真实账户执行创建、更新或删除验证。

## 验收标准

- [x] 创建和修改表单在保存前加载并选择用户可用分组，提交请求包含所选 `group_id`。
- [x] 密钥列表显示名称、脱敏密钥及复制按钮、`quota_used / quota` 用量；不会显示完整密钥或状态列。
- [x] 复制操作仅在受信 renderer 触发时执行，完整密钥不进入 renderer IPC 返回值。
- [x] 完成定向单元测试、TypeScript、变更文件 Biome 检查、`git diff --check` 和状态记录更新。

## 验证记录

### 运行时 preload 兼容修复（2026-08-09）

- 发现正在运行的旧 preload 未暴露 `getAvailableGroups` 时，密钥表单会显示内部错误 `api.getAvailableGroups is not a function`。
- 页面现在会检测该窄 API 是否存在；缺失时显示“分组功能需要重启软件后使用，请重启后重试。”，不再暴露内部函数错误。重启后新版 preload 已通过 `sub2api:get-available-groups` 调用主进程接口。
- 定向 Vitest：`Sub2ApiKeySettings` 与 IPC handlers 共 2 个文件、8 项通过，包含旧 preload 缺少方法的回归用例；变更范围 Biome 通过。

- 定向 Vitest：4 个文件、40 项通过。
- TypeScript：`corepack pnpm exec tsc --noEmit --pretty false` 通过。
- 生产构建：`corepack pnpm run build` 通过；保留既有 preload `any` warning。
- 变更文件 Biome：无 error；保留既有 preload `any` warning。
- `git diff --check`：通过。
- 未执行真实账户创建、修改、删除或复制验证，避免使用线上写操作和实际密钥。
