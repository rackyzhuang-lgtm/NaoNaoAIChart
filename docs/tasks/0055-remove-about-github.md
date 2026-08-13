# 任务 0055：移除“关于”页 GitHub 入口

- 状态：已完成
- 日期：2026-08-13
- 负责人：主 Agent

## 目标

- 移除桌面客户端“关于”页中的 Github/代码仓库可见入口。
- 保留 NaoNaoAI 品牌、官网入口和更新检查能力。
- 不修改 Git 远程、README、许可证或源代码来源记录。

## 计划

1. 定位“关于”页 GitHub 图标、标题和链接。
2. 移除对应 UI 及无用属性，并更新可见入口测试。
3. 运行定向 Vitest、TypeScript、生产构建和 `git diff --check`。
4. 确认开发客户端热更新或重启后可供手工验收。

## 功能测试与验收标准

- [x] `src/renderer/routes/about.tsx` 不包含 GitHub 图标导入、Github 标题或仓库 URL。
- [x] 关于页仍包含 `https://naonaoai.shop/` 官网入口。
- [x] 定向可见入口/品牌测试通过：2 个文件、6 项通过。
- [x] TypeScript、生产构建和 `git diff --check` 通过；构建保留既有 warning。
- [x] Electron 客户端仍在运行，renderer 返回 HTTP 200。

## 验证记录

- `corepack pnpm exec vitest run src/renderer/visible-entrypoints.test.ts src/renderer/branding.test.ts`：通过，2 个文件、6 项测试通过。
- `corepack pnpm check`：通过。
- `corepack pnpm run build`：通过；保留既有依赖 `eval`、循环分块、Browserslist 数据过期和大 chunk warning。
- `git diff --check`：通过。
- renderer `http://localhost:1212/`：HTTP 200，标题为 `NaoNaoAI Chat`。
- Electron “关于”页手工点击复核：未执行，客户端保持运行供项目所有者验收。

## 未授权范围

- Git 推送、打包、标签和 Release 发布。
