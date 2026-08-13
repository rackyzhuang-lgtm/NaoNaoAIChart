# 任务 0056：发布 NaoNaoAI Chat v1.22.9

- 状态：发布提交和标签已推送；远程打包按要求不等待
- 日期：2026-08-13
- 发布版本：`1.22.9`
- 触发标签：`v1.22.9`
- 发布远程：`github-release`

## 授权范围

项目所有者已明确授权本轮提交 GitHub 并打包 Release；随后明确无需等待远程打包成功。

## 发布内容

- 包含当前工作区从 `D:\project\EazyAI-Chat` 只读同步到 NaoNaoAI 的功能、测试、架构记录与生成后的无限画布产物。
- 保留 NaoNaoAI 品牌和固定服务配置；移除“关于”页中的 GitHub/代码仓库可见入口。
- 不修改同步源目录，不提交本地账号、缓存、访问令牌或 API Key。
- 创建新的不可变 `v1.22.9` 标签，不移动或覆盖已有标签。

## 功能测试与验收标准

- [x] `corepack pnpm check` 通过。
- [x] `corepack pnpm lint` 退出码为 0，0 error；保留 911 条既有 warning。
- [x] `corepack pnpm test` 全量测试成功结束：291 个文件、2,740 项通过；3 个文件、61 项按设计跳过。
- [x] `corepack pnpm run build` 生产构建通过；保留既有依赖 `eval`、循环分块、Browserslist 数据过期和大 chunk warning。
- [x] `corepack pnpm test:e2e` 桌面烟测通过：1 项通过。
- [x] 无限画布入口引用的新 hash 产物存在，旧 hash 产物从提交中移除。
- [x] 待提交秘密模式扫描和 `git diff --check` 通过；扫描命中均为明确测试占位值或字段名。
- [x] 发布提交 `73a86c71563a95c46afa44de7dec05a4a38697fd` 已推送到 GitHub `main`。
- [x] `v1.22.9` 带注释标签已推送，满足桌面打包/Release 工作流的 `v*` 触发条件。
- [x] 按项目所有者要求未执行本地安装包打包，也不等待或轮询远程打包结果；远程 Windows/macOS 制品和 GitHub Release 未记录为成功。

## 门禁修复

- 首次全量 Vitest 把本机 `src/node_modules` junction 下的 Zod 依赖测试误收集进来，业务测试 4,154 项通过，但两个依赖测试因缺少依赖包自身的开发依赖而失败，命令退出码为 1。
- 已将 Vitest 排除模式收紧为任意层级的 `**/node_modules/**`、`**/release/**` 等目录，并增加配置级回归测试；重跑全量测试后退出码为 0。

## 发布限制

- 当前发布流程不配置 Windows/macOS 代码签名或公证凭证。
- 不执行真实账户、真实 API Key 或真实模型请求。
