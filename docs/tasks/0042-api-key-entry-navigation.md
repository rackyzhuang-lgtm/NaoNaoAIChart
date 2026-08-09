# 任务 0042：API 密钥入口导航

- 状态：已完成代码实现，真实 Electron 手工点击待执行。
- 日期：2026-08-09
- 范围：API 密钥列表中的“用于聊天”和“导入到无限画布”入口。

## 目标

- 点击“用于聊天”后保存所选密钥的 Provider 配置，创建并切换到新聊天会话，且新会话使用该密钥返回的首个可用模型。
- 点击“导入到无限画布”完成现有模型导入后，使用应用路由真正跳转到“无限画布”，不再直接修改浏览器历史绕过 Hash Router。

## 功能测试与验收标准

- [x] “用于聊天”调用 `prepareProviderBinding`，保存 OpenAI-compatible Provider 配置。
- [x] “用于聊天”创建新聊天会话，并切换到该会话路由。
- [x] 新聊天会话显式使用绑定结果中的首个模型，避免沿用其他 Provider 的默认模型。
- [x] “导入到无限画布”保存待导入 payload 后调用 TanStack Router 的 `/infinite-canvas` 路由。
- [x] 失败时保留原错误处理，不切换到目标页面。

## 验证记录

- `corepack pnpm exec vitest run src/renderer/components/settings/Sub2ApiKeySettings.test.tsx`：通过，1 个文件、5 项测试。
- `corepack pnpm exec biome check src/renderer/components/settings/Sub2ApiKeySettings.tsx src/renderer/components/settings/Sub2ApiKeySettings.test.tsx`：通过。
- `D:\software\nodejs\node.exe --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false`：通过，退出码 0。
- `git diff --check`：通过。
- 真实 Electron 窗口中点击两个入口、验证设置弹窗关闭及最终页面：未执行。
- 真实 API 请求、打包、发布和 Git 推送：未执行。
