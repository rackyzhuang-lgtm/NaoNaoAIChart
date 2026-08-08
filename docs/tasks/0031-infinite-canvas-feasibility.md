# 任务 0031：无限画布项目嵌入可行性评估

- 状态：Done（仅评估，未实现）
- 日期：2026-08-08
- 范围：评估 `https://github.com/basketikun/infinite-canvas` 是否适合嵌入 NaoNaoAI Chat

## 目标

- 了解上游项目的运行形态、功能边界、数据存储、模型调用和扩展机制。
- 对照本仓库 Electron/React/鉴权边界，给出可执行的集成路径、风险和验收门槛。

## 非目标

- 不复制上游源码、不新增依赖、不修改 sub2api 服务端。
- 不执行 Git 推送、打包、Release 发布或真实模型请求。

## 上游事实（2026-08-08 通过 GitHub API/Raw 复核）

- 仓库默认分支为 `main`，根项目 README 和 `LICENSE` 声明 MIT；`web/package.json` 是 `private` 的 Vite SPA，不是可直接安装的 npm 画布组件。
- `web` 使用 React 19、React Router 7、Vite 7、Ant Design 6、Tailwind 4、Zustand 5；构建/类型命令是 `vite build` 和 `tsc --noEmit`，未发现与本仓库同等的 Vitest/Playwright 测试脚本。
- 画布路由为 `/canvas` 和 `/canvas/:id`，项目、节点、连接、视口和对话状态由 Zustand 持久化到 `localforage`（IndexedDB，失败时回退 localStorage），媒体 Blob 使用独立 IndexedDB store；可选 WebDAV 同步。
- AI 请求在浏览器 renderer 直接发往用户配置的 OpenAI/Gemini/Ark 兼容地址，API Key 随 Zustand 配置持久化在浏览器存储；画布插件是远程 JavaScript，按上游安全策略可直接读取页面数据和 API Key。
- 上游插件清单的许可证字段为 `AGPL-3.0`，与根项目 MIT 声明不一致；分发插件前必须单独确认许可证来源和义务。

## 与本仓库的兼容性结论

| 维度 | 事实 | 结论 |
| --- | --- | --- |
| 画布交互 | 拖拽、缩放、框选、连线、小地图、撤销重做、导入导出已实现 | 画布核心复用价值高 |
| UI/运行时 | 上游 React 19/Router 7/Tailwind 4/AntD 6；本仓库 React 18/TanStack Router/Tailwind 3/MUI+Mantine | 原样源码合并冲突高 |
| 路由 | 上游使用 BrowserRouter | Electron `file://` 打包需改为 hash/自定义协议或同宿主路由，否则深链刷新风险高 |
| 凭证 | 上游 renderer 直接持有并持久化 API Key | 不符合 ADR-0001/0005，必须改为现有 Provider/主进程能力 |
| 网络 | 上游依赖浏览器 CORS 和用户自定义 Base URL | sub2api 图像/视频端点及 CORS 尚未形成客户端契约，需逐端点确认 |
| 插件/Agent | 远程插件可执行任意页面级代码；Canvas Agent/MCP 需要本地命令 | 首发应禁用，后续专项威胁建模 |
| 许可证 | Chatbox GPL-3.0 + 上游根项目 MIT；插件清单标 AGPL-3.0 | 可处理，但必须保留声明并完成分发前复核 |

## 可行性结论

- “加入无限画布入口并支持本地画布编排”：高可行性，建议作为独立 renderer 功能逐步移植。
- “原样把上游 `web` SPA 塞进当前 renderer”：中低可行性，不建议，主要问题是运行时/CSS/路由和凭证边界冲突。
- “完整复用上游生图、生视频、插件、WebDAV、Canvas Agent”：中可行性，需拆分成多个适配项目，不能作为首个迭代的验收目标。

## 推荐集成路径

1. 先做画布核心垂直切片：新建 `/canvas` 入口和 Sidebar 菜单，仅保留项目管理、节点/连接、视口、撤销重做、导入导出和本地持久化。
2. 将画布状态迁移到明确命名空间的 IndexedDB/应用存储；媒体导入导出复用本仓库 `platform` 文件能力，不使用上游的任意远程 URL 或自定义 API Key 表单。
3. 通过现有 Provider/主进程能力注入文本和图像生成适配器；先以 mock/contract fixture 验证，确认 sub2api 对应 `/v1` 端点和 CORS 后再开放真实调用。
4. 远程插件、WebDAV、Canvas Agent/MCP 和视频/音频任务分别立项；每项先新增 ADR 和安全/兼容性测试。
5. 只有在画布核心稳定后，才评估是否需要独立 BrowserWindow。若采用独立窗口，必须处理静态资源 `base`、BrowserRouter 深链、可信 URL 校验、窗口生命周期和 asar 打包路径。

## 功能测试与验收标准（实施时）

- 菜单：桌面 Windows/macOS/Linux 均显示“无限画布”入口，选中态正确，打开/返回不影响聊天和账户页。
- 画布核心：创建、重命名、删除项目；拖拽/缩放/框选/连线；撤销/重做；刷新和重启后项目与媒体仍可恢复。
- 文件：导入/导出一个包含图片和连接的项目，导出文件可再次导入；取消或损坏文件有明确错误。
- 模型边界：未登录/无 API Key 时不发请求；mock 契约覆盖成功、401、403、429、超时和服务关闭；renderer 不出现 JWT、refresh token 或完整 API Key。
- 安全：默认不加载远程插件、不执行任意 URL 脚本、不开放管理员 API；CSP/顶层导航/IPC sender 规则回归通过。
- 工程验收：`pnpm check`、`pnpm lint`、`pnpm test`、`pnpm run build`、锁定 Playwright 桌面 E2E、`git diff --check` 全部按实际结果记录；三平台至少完成构建矩阵。

## 本轮已执行验证

- GitHub 元数据、README、LICENSE、`web/package.json`、路由、画布 store、API 请求、WebDAV 和插件运行时代码：已通过 HTTP API/Raw 只读检查。
- `git diff --check`：通过。
- `git status --short --branch`：已执行；工作区保留所有既有用户改动，本轮未修改业务代码。
- 本仓库 TypeScript、lint、Vitest、生产构建、桌面 E2E：未执行，本轮没有代码或依赖变更。
- 上游 `web` 实际安装/构建/运行：未执行；Git clone 在当前环境因 GitHub SSL 连接重置失败，结论基于可复现的 HTTP Raw/API 内容，不将其写成构建通过。

## 待项目所有者确认

- 首发是否只要画布编排，还是必须同时包含生图/生视频。
- 是否允许画布功能使用独立 BrowserWindow，还是必须与主窗口同一路由/同一存储。
- sub2api 当前实例是否公开图像、视频、Responses 等所需网关端点，以及是否允许桌面直连/CORS。
- 是否接受暂不支持远程插件、WebDAV、Canvas Agent/MCP；若不接受，需要分别建立安全和许可证 ADR。
