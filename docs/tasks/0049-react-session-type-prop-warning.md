# 任务 0049：修复 Avatar 的 React 属性警告

- 状态：代码修改完成，自动化验证通过
- 日期：2026-08-10

## 问题

控制台出现 `React does not recognize the sessionType prop on a DOM element`。`SystemAvatar` 未从 props 中取出 `sessionType`，导致它通过剩余 props 传给 Mantine `Avatar`，最终落到原生 `div`。

## 修改

- 在 `SystemAvatar` 中拦截 `sessionType`，只保留在组件 API 层，不再向 DOM 透传。
- 不改变头像尺寸、样式、图标和现有调用方行为。

## 验收标准

- [x] `SystemAvatar` 不向 DOM 输出 `sessionType` 属性。
- [x] Node 22 TypeScript、Biome 和 `git diff --check` 通过。
- [ ] 浏览器控制台不再出现该 React 警告；真实 Electron 手工复现待执行。
