# ADR-0007：移除 Chatbox 运行时网络调用与用户界面入口

- 状态：Accepted
- 日期：2026-08-06

## 背景

NaoNaoAI Chat 使用 Chatbox 代码作为桌面基线，但产品服务由固定的 sub2api 实例提供。审计发现默认启动仍会请求 Chatbox 远程配置、版本接口和 Chatbox AI 模型目录，HTML 还包含上游遥测脚本；这些请求既不是 sub2api 业务闭环所需，也会把用户带入 Chatbox 品牌服务。

## 决策

1. 默认运行路径不得调用 `api.chatboxai.app`、`chatboxai.app`、`chatboxapp.xyz` 或 Chatbox CORS/更新服务。
2. 不在默认 Provider、设置菜单、首页推荐和 About 页面展示 Chatbox AI 或 Chatbox 官网入口。
3. 保留 enum、schema、错误类型和迁移分支，用于读取旧用户配置；这些兼容代码不得成为默认网络调用路径。
4. 用户主动配置的第三方 Provider 和固定 sub2api 控制面/模型网关不受本 ADR 限制。
5. 自有更新、错误上报和统计服务在另立决策并明确服务地址前保持关闭或本地行为。

## 后果

- 新安装用户需要选择并配置 OpenAI-compatible Provider 或使用 NaoNaoAI 账户绑定的 sub2api API Key。
- Chatbox AI 旧配置不会被删除，但其模型目录和许可证服务不再自动刷新。
- 上游同步仍可进行，但同步结果必须经过 Chatbox 网络和文案静态审计。
