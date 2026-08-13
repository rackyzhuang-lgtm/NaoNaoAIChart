# 任务 0064：修复 Windows CI PDF 解析测试超时

- 状态：已完成
- 日期：2026-08-14
- 关联失败：`v1.22.13` Windows/macOS 流水线

## 根因

`src/main/file-parser.test.ts` 的首个 PDF 测试在 CI 冷启动 PDF.js worker 时超过 Vitest 默认 10 秒超时，失败发生在测试阶段，未进入打包步骤。

## 修复范围

- 将 `parsePdf` 测试套件超时提高到 30 秒，覆盖 PDF.js 首次加载的跨平台冷启动差异。
- 不修改生产 PDF 解析逻辑，不修改 `D:\project\EazyAI-Chat`。

## 验收标准

- `src/main/file-parser.test.ts` 定向测试通过。
- `git diff --check` 通过。
- `src/main/file-parser.test.ts` 定向测试 6/6 通过。
- 版本提升为 `1.22.14`，新标签触发远程流水线；不等待远程构建完成。
