# 任务 0040：右侧栏示例会话与右键删除

- 状态：已完成代码实现，待桌面手工验收
- 日期：2026-08-09
- 范围：默认示例会话集合、示例会话可见品牌文案、桌面右键会话菜单。

## 目标

- 首次启动时仅初始化截图中约定的 9 个示例会话。
- 示例对话中展示的历史 `Chatbox` 文案改为 `NaoNaoAI Chat`。
- 右侧会话项支持右键菜单删除，并清理当前会话的本地数据。

## 功能测试与验收标准

- [x] 默认中文会话集合只包含截图中的 9 个名称，且置顶状态与截图一致。
- [x] 默认示例对话的可见文本不包含 `Chatbox` 品牌文案。
- [x] 桌面右键会话项可显示“删除”，确认后调用永久删除流程。
- [x] 删除当前会话后导航到新会话入口，删除其他会话后当前会话保持不变。
- [x] 定向 Vitest、Node 22 TypeScript 检查、变更范围 Biome 和 `git diff --check` 通过。

## 验证记录

- `corepack pnpm exec vitest run src/renderer/packages/initial_data.test.ts src/renderer/utils/session-utils.test.ts`：通过，2 个文件、8 个测试。
- `corepack pnpm exec tsc --noEmit --pretty false`：通过，0 个错误。
- `corepack pnpm exec biome check src/renderer/components/session/SessionItem.tsx src/renderer/packages/initial_data.test.ts`：通过；`initial_data.ts` 的既有 warning 未新增 error。
- `git diff --check`：通过。
- 真实 Electron 右键菜单、删除确认和当前会话导航：未执行，需桌面手工验收。
