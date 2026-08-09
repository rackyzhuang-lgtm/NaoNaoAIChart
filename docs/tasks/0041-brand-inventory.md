# 任务 0041：品牌资产与标识盘点

- 状态：已完成盘点，待项目所有者提供新品牌资料后进入替换任务。
- 日期：2026-08-09
- 范围：品牌名称、可见文案、Logo/图标、业务域名、外链、应用安装标识、深度链接协议、持久化键和 Chatbox 历史兼容内容。

## 目标

- 建立后续重品牌工作的单一事实来源，区分可以直接替换的用户可见内容与必须单独迁移的运行时标识。
- 记录当前 NaoNaoAI 品牌资源与仍保留的 Chatbox 历史内容，避免遗漏启动页、托盘、示例数据、远程资源和本地数据键。
- 本任务不变更产品名称、Logo、域名、应用 ID、协议、后端服务或历史兼容能力。

## 功能测试与验收标准

- [x] 记录当前显示名、产品名、账户/Agent 子品牌及其主要消费位置。
- [x] 记录主 Logo、平台图标、renderer 副本、历史图标和实际消费位置。
- [x] 记录所有自有或产品相关域名，并说明其业务边界和替换风险。
- [x] 记录 npm 包名、Electron appId、深度链接协议和本地持久化键的迁移影响。
- [x] 对 Chatbox 遗留内容分层标记为历史兼容、可见待替换或需项目所有者决策。
- [x] 文档中的关键位置已用 `rg` 复核，文档差异通过空白检查。

## 验证记录

- `rg -n -i "naonaoai|nao nao" package.json electron-builder.yml src/main src/renderer src/shared --glob '!**/*.test.*'`：已执行，用于复核当前 NaoNaoAI 名称和主要消费位置。
- `rg -n -i "chatboxai\\.app|chatboxai\\.com|chatboxapp\\.xyz|api\\.ai-chatbox\\.com|static\\.chatboxai\\.app|download\\.chatboxai\\.app" src assets package.json`：已执行，用于复核遗留域名和远程资源。
- `rg -n -i "naonaoai\\.shop|eazyai\\.shop|pay\\.ldxp\\.cn|gitee\\.com/ribbog77/nao-nao-aichart" package.json src assets docs --glob '!docs/STATUS.md'`：已执行，用于复核自有域名及外链。
- `rg -n -i "chatbox:first-successful-chat|chatbox:lastarchivesessiontipat|setasdefaultprotocolclient|chatbox-dev|xyz\\.chatboxapp" package.json electron-builder.yml src`：已执行，用于复核系统标识和迁移键。
- `git diff --check`：通过。
- TypeScript、lint、单元测试、生产构建、打包和桌面 E2E：未执行；本轮仅修改 Markdown 文档。

## 交付物

- `docs/BRAND-INVENTORY.md`：品牌与标识基线。
- `docs/STATUS.md`：本轮完成、验证结果、风险和后续输入要求。
