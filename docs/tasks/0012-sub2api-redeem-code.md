# TASK-0012：普通用户兑换码

- 状态：Done
- 负责人：主 Agent
- 关联 ADR：ADR-0001、ADR-0003、ADR-0005、ADR-0006

## 目标

让已登录普通用户在桌面账户页提交兑换码，并查看服务端返回的兑换结果与脱敏兑换历史。

## 已确认输入

- 提交路由为 `POST /api/v1/redeem`，请求体为 `{ "code": string }`。
- 历史路由为 `GET /api/v1/redeem/history`，返回用户自己的兑换记录。
- 两个接口使用面板 JWT；兑换操作属于用户主动写入，线上验证不得使用测试账号执行兑换。
- 服务端兑换结果包含消息、类型、数值及可选的新余额/并发额度；历史记录包含兑换码原文，客户端必须脱敏。

## 本批范围

- 增加兑换请求/结果/历史记录 zod schema、主进程 client、受信 IPC 和 preload typed API。
- 在账户页增加兑换码输入、提交中/成功/失败状态和脱敏历史记录。
- 移除桌面帮助菜单中残留的 Chatbox GitHub/Issues 网络入口，并清理先进设置中的 Chatbox 诊断文案。
- 增加契约、client、IPC 和 renderer 回归测试，更新翻译、路线图和状态记录。

## 本批非目标

- 不在真实部署执行兑换，不创建、修改或删除兑换码。
- 不暴露兑换码原文、管理员字段、用户对象或服务端内部错误上下文。
- 不实现支付、优惠码、管理员兑换码管理或服务端行为变更。

## 验收标准

- [x] 兑换请求只通过主进程面板 JWT 发起，输入经过长度和空白校验。
- [x] renderer 只接收兑换结果和历史脱敏 DTO，历史不含兑换码原文。
- [x] 提交中、成功、失败、空历史和服务错误均有稳定 UI。
- [x] 定向测试、TypeScript、Biome、生产构建和 Git 检查完成。

## 验证记录

- 定向 Vitest：7 个文件、38 项通过。
- TypeScript：通过。
- 变更文件 Biome：0 error；保留 preload 与先进设置既有 warning。
- 生产构建：`corepack pnpm exec electron-vite build --mode production` 通过，产物在 `release/app/dist`。
- 真实部署只读验证：登录后 `GET /api/v1/redeem/history` 返回 HTTP 200、`code=0`，字段与本批 schema 一致；未输出兑换码原文，未调用 `POST /api/v1/redeem`。
- Chatbox 清理：桌面帮助菜单不再打开上游 GitHub/Issues，先进设置不再显示 Chatbox 诊断文案，导出文件名改为 `naonaoai-exported-data-*`。
