# TASK-0025：修复账户 ContextBridge API 包装

- 状态：Completed
- 负责人：Codex
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005

## 目标

修复桌面账户页在服务端和 IPC 均可用时仍显示“账户服务不可用”、无法登录的问题。

## 根因

Electron `contextBridge` 暴露的方法是只读且不可配置的属性。账户页以该对象本身作为 JavaScript `Proxy` target，并在 `get` trap 中返回新的错误处理包装函数，违反 Proxy 对不可配置属性的返回值不变量，因此在实际 IPC 方法执行前抛出 `TypeError`。

## 范围

- 将错误处理代理改为使用独立的空包装对象作为 target，继续转发到原始窄业务 API。
- 增加冻结 API 对象的 renderer 回归测试，模拟 `contextBridge` 属性约束。
- 使用真实 Electron 主进程和固定服务的公共只读设置接口验证账户页进入登录状态；不提交账号或令牌，不执行真实登录。

## 非目标

- 不修改 sub2api 服务端、登录契约或令牌存储。
- 不放宽 Electron IPC sender 校验。
- 不调用真实模型或写入线上数据。

## 验收标准

- 冻结的 renderer API 对象可以加载公共设置和未登录会话。
- 账户页显示登录表单，不显示“账户服务不可用”。
- 定向测试、TypeScript、生产构建、桌面只读联调和 `git diff --check` 通过。

## 结果

- 账户错误处理代理改为使用独立空对象作为 target，原始 `contextBridge` API 只作为调用接收者，不再违反不可配置属性的 Proxy 不变量。
- renderer 定向测试 6 项通过，其中新增用例冻结完整账户 API，并确认公共设置与未登录会话均只调用一次、页面进入登录状态。
- `corepack pnpm check` 通过；变更的账户组件与测试通过 Biome 检查；生产构建通过，保留既有依赖 `eval`、循环分块、Browserslist 和大 chunk warning。
- 真实 Electron 使用临时用户目录完成固定服务只读验证：公共设置返回版本 `0.1.171`，电子邮件登录表单可见，页面未显示“账户服务不可用”；未提交账号、未执行登录、未写入线上数据。
- 发布版本递增为 `1.22.4`，通过新标签触发远端安装包与 Release 工作流。
