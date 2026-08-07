# 任务 0019：README 产品文案清理

状态：Done

## 目标

- 将仓库根 README 和中文 README 改为 NaoNaoAI Chat 的真实产品说明。
- 移除用户可见的上游品牌、官网、下载、推广和社区入口，避免把旧产品误认为当前发行版。

## 范围

- `README.md`、`doc/README-CN.md` 和 `team-sharing/README*.md`。
- 保留当前固定 sub2api 服务、桌面平台范围、开发命令、Gitee 打包产物位置和许可证事实。

## 非目标

- 不改内部评测脚本的环境变量、命令名或 fixture 路径。
- 不覆写 ADR、上游同步记录、历史技术文档或代码兼容标识；这些文件中的上游名称属于工程追溯信息。
- 不宣称未完成的跨平台签名、公证、自动更新或移动端支持。

## 验收

- 根 README 和中文 README 不再包含旧产品品牌、官网、上游下载地址或移动端下载入口。
- 根 README 不再链接到旧团队共享服务说明。
- 团队共享 README 明确说明该目录不是当前发行功能，不提供旧服务部署指引。
- 文档链接、Markdown 结构、`git diff --check` 和既有代码检查不回归。

## 结果

- 根 `README.md` 和 `doc/README-CN.md` 已改为 NaoNaoAI Chat 产品说明，删除旧品牌、官网、下载入口、推广徽章和移动端内容。
- `team-sharing/README*.md` 已改为历史材料和不支持能力说明，根 README 不再链接旧团队共享服务。
- README 扫描只剩 `scripts/session-rag-eval/README.md` 的内部评测接口标识；其环境变量、命令名和 fixture 路径与脚本实现绑定，本任务不改名。
- `git diff --check` 通过。
