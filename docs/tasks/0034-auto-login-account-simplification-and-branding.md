# 任务 0034：自动登录、账户精简与品牌资源修正

- 状态：Done
- 日期：2026-08-09
- 关联 ADR：ADR-0001、ADR-0005

## 目标

1. 用户在首次登录时选择自动登录后，桌面应用重启时可通过主进程刷新会话恢复登录。
2. 移除普通用户界面的用量明细、平台配额、模型广场和错误请求，并撤销相应 renderer IPC 能力。
3. 在兑换码模块中提供固定购码网页 `https://pay.ldxp.cn/shop/naonaoai` 的内嵌弹窗入口。
4. 将当前 renderer 残留的 Chatbox 图标替换为仓库已确认的 NaoNaoAI 品牌资产。

## 实施边界

- 自动登录仅加密保存 refresh token。密文由 Electron `safeStorage` 处理后保存在主进程配置；access token、refresh token 和密文均不返回 renderer。
- 自动登录恢复失败或用户退出时清除本地密文；安全存储不可用时不持久化。
- 购码页面只允许题述固定 HTTPS 地址，并置于禁止顶层导航的 sandbox iframe。
- 不修改 sub2api 服务端，不执行线上兑换、打包、推送或发布。

## 验收标准

- [x] 勾选自动登录时，登录请求不把 UI 字段发送到 sub2api；启动恢复仅使用主进程持有的 refresh token。
- [x] 未勾选、刷新失败、退出登录和不可用安全存储均不会留下可恢复会话。
- [x] 四个移除功能没有 renderer、preload 或主进程受信 IPC 入口，也不发起对应请求。
- [x] 兑换码页点击“获取兑换码”打开固定站点 iframe 弹窗。
- [x] 左侧栏和启动页使用与 `assets/icon.png` 相同的 NaoNaoAI 图标，不使用截图中的橙色 Chatbox 图标。
- [x] 完成定向测试、TypeScript、变更文件 Biome、生产构建、`git diff --check` 和 `git status --short --branch`；未执行项如实记录。

## 验证记录

- 定向 Vitest：7 个文件、42 项通过，覆盖自动登录的 refresh token 持久化/恢复、固定 IPC、账户登录选项、移除功能不可见、购码弹窗与品牌资源。
- TypeScript：`corepack pnpm exec tsc --noEmit --pretty false` 通过。
- Biome lint：变更文件无新增 error；保留 `main.ts`、`store-node.ts` 与 preload 的既有 warning。
- 生产构建：`corepack pnpm run build` 完成；保留上游依赖 `eval` 警告。
- Electron 开发启动烟测：`corepack pnpm start` 成功构建 main/preload/renderer 并启动桌面应用。环境记录到 Chromium 缓存目录访问被拒绝及 quota database warning，未见本任务相关错误。
- 真实账号的勾选自动登录后重启恢复：未执行，避免在本轮使用或持久化实际账户凭证。
- `git diff --check`：通过。`git status --short --branch`：已执行；本轮未推送、未打包、未发布。
- 后续修正：补充简体中文“获取兑换码”“保持登录”词条，避免 i18n 未命中时回退为英文。
