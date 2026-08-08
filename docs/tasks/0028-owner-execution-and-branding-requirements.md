# 任务 0028：项目所有者执行要求与 Chatbox Logo 现状记录

- 状态：源码修复已完成，桌面 E2E 待执行
- 日期：2026-08-08
- 提出者：项目所有者

## 目标

将项目所有者的长期协作要求写入仓库，并记录当前软件中的品牌问题，作为后续任务的前置约束。

## 已确认要求

1. 未经项目所有者明确要求，不执行 Git 推送、软件打包或 Release 发布。
2. 项目所有者当前观察到软件左上角仍显示原 Chatbox Logo。
3. 项目所有者当前观察到启动阶段的过渡动画仍使用原 Chatbox Logo。
4. 每项后续工作开始前先提供细分计划，计划必须包含功能测试和验收标准。
5. 未实际执行测试并如实记录结果，不得向项目所有者报告任务完成；未执行的测试必须明确标记。

## 本轮范围

- 更新根目录 `AGENTS.md`，使要求对后续 Agent 持久可见。
- 更新 `docs/STATUS.md`，记录当前要求和本轮验证事实。
- 保留既有 Logo 任务和 ADR 的历史内容，不覆写历史结论。
- 本轮不修改应用代码，不推送、不打包、不发布。

## 后续 Logo 修复计划（待单独授权实施）

1. 定位左上角 Logo 和启动过渡动画的实际资源、渲染入口及可达路径。
2. 用项目所有者确认的品牌资源替换两处 Chatbox Logo，并保留必要的兼容资源读取。
3. 增加或更新定向功能测试，覆盖左上角 Logo、启动过渡动画和旧 Chatbox Logo 不可见。
4. 执行类型检查、相关测试、桌面启动功能测试和 `git diff --check`；未经项目所有者明确要求，不执行打包、推送或发布。

## 本轮验证

- 通过 UTF-8 内容检索确认四项要求已写入 `AGENTS.md` 和本任务记录。
- UTF-8 内容检索：通过，`AGENTS.md` 中四类要求的 5 项关键断言全部匹配。
- `git diff --check`：通过。
- `git status --short --branch`：已执行，当前为 `main...github/main [ahead 3]`；本轮未推送。
- Logo 产品功能测试：未执行，本轮仅记录要求，未修改应用代码。

## 本次 Logo 修复结果（2026-08-08）

- Sidebar 左上角 Logo 明确使用 `src/renderer/static/icon.png`，并增加 `NaoNaoAI Chat logo` 可验收标识。
- 开发和生产启动模板均使用 NaoNaoAI Logo；原 Chatbox 内联启动 SVG 已放入不可渲染的 `<template>` 节点，不再进入可见启动动画。
- 应用图标入口从旧的 `logo192.png` 改为 NaoNaoAI `icon.png`。
- 未修改 sub2api、鉴权或服务端行为。

## 本次验证结果

- 定向 Vitest：通过，`src/renderer/branding.test.ts`，3 项通过。
- TypeScript：通过，0 error。
- Biome：通过，`Sidebar.tsx`、`branding.test.ts`、`desktop-smoke.spec.ts` 无 error。
- `git diff --check`：通过。
- 桌面 E2E：未执行；仓库脚本会先生成生产构建，本轮按要求不执行构建/打包。
- Git 推送、软件打包、Release 发布：未执行。
