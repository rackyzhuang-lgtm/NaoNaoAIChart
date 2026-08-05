# TASK-0002：品牌基线与 sub2api 契约登录骨架

- 状态：Completed
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0004

## 目标

将桌面产品品牌设置为 `NaoNaoAI Chat`，并基于真实 sub2api 源码与固定实例建立可测试的普通用户 API 契约、主进程 HTTP client 和安全登录边界，为后续账户 UI 与 API Key 管理提供稳定基础。

## 已确认输入

- 产品名称：`NaoNaoAI Chat`
- 品牌源图：仓库根目录 `logo.png`
- 固定服务地址：由 `SUB2API_BASE_URL` 提供
- 项目所有者已在当前会话提供普通用户测试凭证；凭证不得写入源码、文档、fixture、日志或提交历史

## 本批范围

- 更新桌面构建、窗口标题和必要的系统级产品名称。
- 从源图生成构建所需的品牌图标资产，不修改原始 `logo.png`。
- 核实公共设置、登录、refresh、logout、当前用户、API Key 和模型列表的实际路由、DTO 与错误响应。
- 建立共享 DTO/schema、URL 构造和错误模型。
- 建立 Electron 主进程侧 sub2api client；renderer 不直接获取 refresh token。
- 为 client、契约解析、refresh 单飞和凭证清理行为添加自动化测试。
- 对固定实例执行不泄露秘密的最小真实验证。

## 本批非目标

- 完整账户中心 UI。
- API Key 的用户界面与 Provider 自动绑定。
- 支付、OAuth、2FA、Passkey、管理员功能。
- iOS、Android。
- 修改或部署 sub2api 服务端。

## 多 Agent 文件边界

- 品牌 Agent：产品名、图标与构建配置，不修改 sub2api client。
- 契约 Agent：只读核实 sub2api 路由、DTO、鉴权和错误语义。
- 安全 Agent：只读核实 Chatbox 主进程、IPC 与安全存储复用点。
- 主 Agent：定义共享接口、实现/整合 client、审查所有 diff、执行真实验证和全量测试。

## 验收标准

- [x] 应用和打包配置使用 `NaoNaoAI Chat`，图标来自项目所有者提供的源图。
- [x] 所有 sub2api URL 从 `SUB2API_BASE_URL` 派生。
- [x] 契约字段与路由有源码证据或真实响应证据；不确定项标记“待确认”。
- [x] 登录凭证、JWT、refresh token 和 API Key 不进入仓库或日志。
- [x] refresh 并发请求单飞；认证失败会清理内存凭证。
- [x] 新增的 renderer 业务桥不能读取 refresh token。
- [x] TypeScript、Biome、相关测试和生产构建通过。
- [x] 文档记录真实验证结果、限制和下一步。

## 完成记录

- 品牌：产品名、HTML 标题、菜单、托盘、启动项和 Windows/macOS/Linux 构建图标已更新。源图未修改；其可见水印仍存在。
- 契约：依据 sub2api 参考源码建立 panel 成功包络、两种错误包络、登录/2FA、refresh、当前用户、API Key 分页和 `/v1/models` schema。
- 客户端：`src/main/sub2api/` 实现主进程内存会话、登录、2FA、当前用户、logout、401 retry 和 refresh 单飞；凭证代际校验覆盖 refresh、重新登录、退出和旧成功响应的并发竞态。
- IPC：preload 仅新增固定业务方法；登录结果、会话状态和当前用户响应不包含 access token、refresh token 或 2FA temp token。sub2api handler 校验当前主窗口与受信 frame，不受信顶层导航会被阻止。
- 契约防护：用户 DTO 剥离未建模字段；URL builder 拒绝跨 origin、反斜杠和 panel/gateway 基础路径逃逸。
- 发布隔离：自动更新和上游 publish 配置已移除，现有发布脚本固定使用 `--publish never`。
- 真实实例：公共设置、普通用户登录、`/auth/me`、refresh 轮换、logout 和空 API Key 列表均成功；`run_mode=standard`。测试账号没有 API Key，因此 `/v1/models` 真实验证未执行。
- 自动化：TypeScript、Biome 和生产构建通过；全量 Vitest 230 files passed、2 skipped，2,411 tests passed、61 skipped。
- 产物：Windows x64/arm64 NSIS 开发验收安装包已生成；x64 打包后 exe 持续运行 20 秒且主进程与 3 个子进程均存活。本次未签名安装包 SHA-256 为 `7707A718514F7F76852A7980EA46D6713DCF9CBAB208B71E07D594671081ADF0`。

## 已知限制

- 本批没有账户登录 UI，新增能力目前只可由后续 renderer 页面调用。
- 会话仅驻留 Electron 主进程内存，应用重启后需要重新登录。跨平台安全持久化待独立 ADR 与三平台验证。
- 上游 preload 仍暴露通用 `electronAPI.invoke`，且主进程存在通用 Store IPC；本批已保护 sub2api handler，但不能声称全局 IPC 已严格最小化。
- `BrowserWindow` 当前仍设置 `webSecurity: false`；本批已阻止不受信顶层导航，账户 UI 接入前仍须专项评估移除影响。
- 已部署 sub2api 的准确 commit 仍待确认；真实行为与当前参考源码相符的范围仅限本批已探测接口。
- 本机缺少创建符号链接的权限，开发验收安装包通过命令行关闭 `signAndEditExecutable` 后生成；正式发布必须在具备权限的构建环境中完成 exe 资源编辑和代码签名。

## 验证命令

```powershell
pnpm check
pnpm lint
pnpm test
pnpm run build
git diff --check
```

`pnpm test:model-provider` 不在本批默认范围。当前上游 E2E 基础设施缺失，不能声称 `pnpm test:e2e` 通过。
