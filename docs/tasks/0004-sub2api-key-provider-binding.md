# TASK-0004：API Key 管理与 Provider 绑定

- 状态：Completed
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0006

## 目标

让已登录的普通用户在桌面应用中管理自己的 sub2api API Key，并将选中的 Key 与真实模型列表绑定到 Chatbox OpenAI Provider，形成账户控制面到模型数据面的最小闭环。

## 已确认输入

- 固定服务地址继续由 `SUB2API_BASE_URL` 提供。
- 项目所有者已提供普通用户测试账号；凭据不得写入源码、文档、fixture、日志或提交历史。
- 真实实例只读验证确认测试账号已有 1 个 active Key，`/v1/models` 返回 19 个模型。

## 本批范围

- 增加 API Key 列表、创建、重命名、启停和删除的 typed client/IPC/UI。
- 列表只向 renderer 返回掩码摘要，不返回完整 Key。
- 仅在用户显式执行 Provider 绑定时，通过窄 IPC 返回所选 Key 和模型列表。
- 将绑定结果写入 Chatbox 既有 OpenAI Provider 设置：固定服务地址、API Key、模型列表和 API Key 鉴权模式。
- 添加契约、client、IPC、renderer 组件和 Provider 绑定测试。
- 使用现有测试 Key 做真实只读 `/v1/models` 验证，不创建、修改或删除线上数据。

## 本批非目标

- 把面板 JWT/refresh token 写入 renderer 持久化存储。
- 在未获得明确授权时创建或删除真实测试 Key。
- 自动发起真实聊天计费请求。
- 管理员 Key、分组管理、IP 黑白名单、高级限额或支付功能。
- 修改 sub2api 服务端。

## 验收标准

- [x] API Key CRUD 请求使用面板 JWT，模型列表使用用户 API Key。
- [x] Key 列表、错误和日志中不出现完整 API Key。
- [x] 未登录或不受信 renderer 无法调用 Key/Provider IPC。
- [x] Provider 绑定写入固定地址、选中 Key 与真实模型列表。
- [x] 相关测试、类型检查、Biome、生产构建和 `git diff --check` 完成。
- [x] `docs/STATUS.md` 记录实际验证结果、未执行项与遗留风险。

## 验证命令

```powershell
pnpm check
pnpm exec biome check <本批变更文件>
pnpm test
pnpm run build
git diff --check
git status --short --branch
```

`pnpm test:model-provider` 与缺少基础设施的 `pnpm test:e2e` 不在本批默认范围。

## 完成记录（2026-08-06）

- 定向测试：6 个文件、21 项通过。
- TypeScript：`corepack pnpm check` 通过。
- Biome：23 个变更文件无 error；保留仓库既有 warning。
- 生产构建：`corepack pnpm exec electron-vite build --mode production` 通过，main/preload/renderer 均生成产物。
- 全量 Vitest：234 个文件、2425 项通过，`src/main/sandbox/persist-artifact.test.ts` 的 2 个 Windows 路径断言失败仍为已知基线问题。
- Electron 开发环境启动成功；本地账户页在 1280x800 与 390x844 视口无横向溢出。Web 预览按设计显示“仅桌面应用可用”。
- 线上验证仅使用已有 Key 读取列表和 `/v1/models`，未创建、修改或删除线上数据。
