# TASK-0003：Electron 安全边界与账户登录界面

- 状态：Completed
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005

## 目标

在账户能力进入 renderer 前收紧 Electron 的页面与 IPC 边界，并实现普通用户可直接使用的登录、2FA、会话状态和错误恢复界面。

## 本批范围

- 恢复 Electron `webSecurity`，验证 renderer 构建不再依赖关闭同源策略。
- 将 preload 的通用 `invoke` 限制为显式维护的既有通道白名单；sub2api 继续只通过窄业务方法暴露。
- 统一校验外部链接协议，拒绝把非 HTTP(S) 地址交给系统浏览器。
- 在设置中增加 NaoNaoAI 普通用户账户入口。
- 覆盖公共设置加载、邮箱密码登录、TOTP、退出、会话过期和网络/服务错误恢复。
- 添加安全边界和账户界面的自动化测试。

## 本批非目标

- 跨重启保存 JWT/refresh token。
- API Key 创建、修改、删除或 Provider 自动绑定。
- 注册、OAuth、Passkey、支付和管理员功能。
- 修改 sub2api 服务端。
- 补齐当前缺失的 Playwright E2E 基础设施。

## 验收标准

- [x] `BrowserWindow` 不再禁用 `webSecurity`。
- [x] preload 拒绝未列入白名单的通用 IPC 通道，且不能通过通用入口调用 sub2api 通道。
- [x] 外部链接仅允许 HTTPS/HTTP，非法协议不会交给 `shell.openExternal`。
- [x] 未登录、登录中、2FA、已登录、退出中和可重试错误状态均有明确界面。
- [x] 认证结果和 renderer 状态中不出现 access token、refresh token 或 2FA temp token。
- [x] 类型检查、新模块 Biome、相关测试和生产构建通过；全量 Vitest 仍有既有 Windows 路径断言失败，见验证记录。
- [x] `docs/STATUS.md` 记录实际验证结果与遗留风险。

## 完成记录

- 安全边界：恢复 `webSecurity: true`，显式启用 `contextIsolation`、关闭 `nodeIntegration`/`webviewTag` 并启用 preload sandbox；顶层导航和 sub2api sender 继续校验。
- IPC：`src/shared/electron-ipc-channels.ts` 维护兼容通道白名单；未知通道和 sub2api 通用调用会在 preload 拒绝。sub2api 仍只通过窄业务方法暴露。
- 外链：`openLink` 与新窗口处理只允许 `http:`/`https:`，`javascript:`、`file:`、`data:` 等协议被拒绝。
- 账户 UI：新增 `/settings/account`，覆盖公共设置、未登录、邮箱密码登录、TOTP、已登录用户摘要、退出、会话过期和可重试错误；浏览器验证开关开启时会明确提示桌面端暂不支持。
- 真实 Electron：开发应用在 `webSecurity: true` 下启动；公共设置返回注册开启、Turnstile/腾讯验证码/TOTP/backend mode 关闭；未登录会话返回 `authenticated=false`；通用调用 sub2api 通道被拒绝。
- 浏览器预览：默认桌面和 390x844 视口均无渲染 error、溢出或重叠；Web 预览显示“账户服务仅在桌面应用中可用”。

## 验证记录

| 命令/检查 | 结果 | 备注 |
| --- | --- | --- |
| `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit` | 通过 | 0 error |
| 新增 3 个测试文件 | 通过 | 11 tests passed |
| `corepack pnpm exec electron-vite build` | 通过 | main/preload/renderer 均构建；保留上游 chunk warning |
| 全量 `corepack pnpm exec vitest run` | 基线失败 | 232 files passed、2 skipped；2 个既有 `persist-artifact` Windows 路径断言失败，2,421 tests passed、60 skipped |
| 本批源码 `biome check` | 通过 | 0 error；变更涉及的既有文件保留原有 warnings |
| 全仓 `biome lint .` | 通过 | 0 error、900 warnings；本批未新增 error |
| `git diff --check` | 通过 | 无空白错误 |
| `git status --short --branch` | 通过 | `main...origin/main`；本批改动保持未提交，未发现额外进程占用 1212/9333 端口 |

## 验证命令

```powershell
pnpm check
pnpm exec biome check <本批变更的源码文件>
pnpm test
pnpm run build
git diff --check
git status --short --branch
```

`pnpm test:model-provider` 不在本批默认范围。当前 E2E 配置与依赖仍缺失，不得声称 `pnpm test:e2e` 通过。跨重启令牌持久化、API Key 管理和 Provider 自动绑定留给下一批。
