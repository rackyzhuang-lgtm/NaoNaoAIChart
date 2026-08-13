# 任务 0054：同步 EazyAI-Chat 最新功能并保留 NaoNaoAI 品牌

- 状态：进行中
- 日期：2026-08-13
- 负责人：主 Agent
- 关联 ADR：ADR-0003、ADR-0004、ADR-0008；源仓库新增架构决策待按最终纳入范围复核

## 目标

- 将只读来源 `D:\project\EazyAI-Chat` 的最新已提交功能同步到当前仓库。
- 保留当前仓库的 `NaoNaoAI Chat`、`NaoNaoAI Account`、`NaoNaoAI Agent` 品牌名称、Logo/图标、固定服务地址、兑换码地址、仓库与发布身份。
- 保留 GPL-3.0 根许可证及已经接受的应用标识、协议和本地数据兼容边界。

## 源与基线

- 当前仓库基线：`443ab2baecf670a58f5c0f58a3d5d8037d16bbd7`。
- 只读源仓库已提交版本：`5b90a211e62e26f81c1c4e782e8c1c66180b1d7f`。
- 源仓库文档确认其功能开发从当前仓库上述 SHA 开始，但源仓库后来重新初始化为快照历史，因此本次按两棵树的实际差异移植，不执行无共同祖先的普通 merge。
- 源仓库现有未提交 `LICENSE` 替换和未跟踪 `src/__tests__/App.test.tsx.bk` 不纳入同步。

## 范围

- 本地会话保留、单一默认会话和原地导航。
- 计划/目标、聊天权限、流式默认值和 GPT-5.6 Sol 配置。
- 固定网关 request ID 增量流、多窗口并发和会话级重试。
- 登录后 API Key 引导、跟进队列、调整方向和 Side Chat。
- 无限画布空白拖动、模型能力导入和公网 HTTPS 安全代理。
- 为上述能力新增或更新的测试、依赖和构建脚本。

## 排除项

- EazyAi 产品名称、Logo/图标、域名、兑换码页、仓库地址、发布版本和发布任务。
- 根许可证替换、秘密信息、真实账号凭证、管理员能力和 sub2api 服务端修改。
- Git 推送、软件打包、标签和 Release 发布。

## 功能测试与验收标准

- [ ] 源仓库上述功能代码和对应测试已纳入当前仓库，品牌冲突已经人工处理。
- [ ] `NaoNaoAI Chat`、`NaoNaoAI Account`、`NaoNaoAI Agent` 和当前主 Logo 未被 EazyAi 资产覆盖。
- [ ] 固定账户/模型服务仍为 `https://naonaoai.shop`，兑换码页和发布仓库身份保持当前值。
- [ ] 根 `LICENSE` 仍为 GPL-3.0，未纳入源端备份文件或敏感数据。
- [ ] `git diff --check` 和 `git status --short --branch` 已执行并记录。
- [ ] `pnpm check`、`pnpm lint`、`pnpm test`、`pnpm run build` 已按 Node 22/pnpm 10 实际执行并记录结果。
- [ ] 与品牌、请求协议、会话队列和无限画布相关的定向测试通过。

## 验证命令

```powershell
git diff --check
git status --short --branch
pnpm check
pnpm lint
pnpm test
pnpm run build
```

不得默认执行 `pnpm test:model-provider`。桌面 E2E、真实模型请求、打包、推送和发布除非另有明确授权，否则标记为未执行。

## 风险与待确认

- 源仓库把固定服务迁移到 `eazyai.shop`，本项目必须回接 `naonaoai.shop` 并复核 request ID、CORS、SSE、取消和重试语义。
- 源仓库将无限画布模型代理扩大到任意公网 HTTPS；该架构变化需要保留 SSRF、DNS pinning、重定向和私网阻断测试，并在纳入后接受对应 ADR。
- 源仓库的发布版本为 `1.22.11`；当前同步不是发布任务，不据此修改当前发行版本或创建标签。

## 结果

进行中；完成后补充实际移植范围、验证结果、未执行项和遗留风险。
## Result update (2026-08-13)

- Source directory `D:\project\EazyAI-Chat` was read only and remains unchanged.
- Selected functional changes and tests from source snapshot `5b90a211e62e26f81c1c4e782e8c1c66180b1d7f` are present in the target with NaoNaoAI branding and current service/release metadata retained.
- `corepack pnpm install --frozen-lockfile`: passed with pnpm 10.33.0; Electron rebuild completed.
- `corepack pnpm check`: passed. `corepack pnpm lint`: passed with 911 existing warnings. `git diff --check`: passed.
- Focused Vitest suites executed without assertion failures but Vitest exited with code 1 after an unexpected worker exit; this is not recorded as a pass.
- Full Vitest, desktop E2E, real model requests, packaging, push, and release were not executed in this continuation.
- Known residual issue: standalone Infinite Canvas typecheck still reports `vendor/infinite-canvas/web/src/lib/canvas/canvas-generation-helpers.ts:51` (`node.metadata` possibly undefined).
