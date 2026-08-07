# TASK-0024：账户入口与启动品牌修复

- 状态：Completed
- 负责人：Codex
- 关联 ADR：ADR-0004、ADR-0007

## 目标

修复桌面启动阶段仍显示 Chatbox 字标、桌面设置账户路由不可达，以及 sub2api 普通用户能力入口不易发现的问题。

## 范围

- 将 renderer 启动画面替换为 NaoNaoAI 图标与产品名。
- 在桌面设置独立路由树注册 `/settings/account`。
- 桌面设置默认进入账户页，并在主侧栏提供账户直达入口。
- 扩展桌面 E2E，实际打开账户页而不登录或写入线上数据。

## 非目标

- 不修改 sub2api 服务端、接口契约或鉴权行为。
- 不新增管理员能力、支付流程或凭证持久化。
- 不执行真实模型调用。

## 文件所有权

- `src/renderer/index.html`
- `src/renderer/index.ejs`
- `src/renderer/Sidebar.tsx`
- `src/renderer/modals/Settings.tsx`
- `src/renderer/routes/settings/account.tsx`
- `src/renderer/routes/settings/index.tsx`
- `test/e2e/desktop-smoke.spec.ts`
- `docs/STATUS.md`

## 验收标准

- [x] 启动画面不再渲染 Chatbox 字标。
- [x] 桌面主侧栏可直接打开 NaoNaoAI 账户页。
- [x] 从桌面设置进入账户页时路由可匹配，页面可显示登录或稳定错误状态。
- [x] 账户服务暂时不可达时仍保留登录表单和重试入口。
- [x] 桌面 E2E 实际点击账户入口并确认账户页已打开。

## 验证命令

```powershell
corepack pnpm check
corepack pnpm exec biome check src/renderer/Sidebar.tsx src/renderer/modals/Settings.tsx src/renderer/routes/settings/index.tsx test/e2e/desktop-smoke.spec.ts
corepack pnpm test:e2e
git diff --check
git status --short --branch
```

## 风险与待确认

- E2E 不登录固定实例，因此仅验证入口、路由和账户页面外壳；真实账号登录沿用既有契约测试与人工联调事实。
- 账户令牌安全持久化仍属于既有发布阶段任务，不在本次修复范围内。

## 结果

- 启动画面改用 `src/renderer/static/icon.png` 与 `NaoNaoAI Chat` 产品名，隐藏上游字标和装饰背景。
- 桌面内存设置路由树补齐 `/settings/account`，桌面设置默认进入账户页。
- 主侧栏桌面端增加账户中心导航，移动端增加账户图标入口。
- 定向账户组件测试 2 个文件、7 项通过；TypeScript、变更文件 Biome 和 `git diff --check` 通过。
- `playwright` 桌面烟测通过：生产产物启动、主侧栏账户入口可打开账户页，默认页面不出现 `Chatbox AI`。
- 账户服务网络不可达时仍按既有逻辑显示“账户服务不可用”和重试按钮；本任务未改变服务端或鉴权行为。
