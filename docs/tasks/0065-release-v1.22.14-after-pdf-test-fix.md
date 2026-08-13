# 任务 0065：v1.22.14 PDF 测试超时修复 Release

- 状态：已触发远程工作流；按要求不等待结果
- 日期：2026-08-14
- 根因：`v1.22.13` Windows/macOS 流水线的 `parsePdf` 测试超过默认 10 秒超时。

## 验收标准

- [x] 修复提交 `7c21d0bd` 已推送到 `github-build/main`。
- [x] `v1.22.14` 与 `release/app/package.json` 的 `1.22.14` 一致并已推送。
- [x] 标签推送已触发远程 Windows/macOS Release；不等待构建完成。
- [x] `src/main/file-parser.test.ts` 定向测试 6/6 通过。
- [x] 未修改生产 PDF 解析逻辑。
- [x] 未执行本地生产构建或安装包打包。
