# ADR-0002：保留 Chatbox 完整历史并使用 main

- 状态：Accepted
- 日期：2026-08-05
- 决策者：项目所有者、主 Agent

## 背景

根仓库尚无提交，但已有项目初始化文档；本地参考目录包含干净的 Chatbox `main` 克隆。长期二开需要能够追踪上游提交、比较变更并进行可审查的同步。

## 决策

1. 先把当前项目文档提交为独立 bootstrap 提交。
2. 将根仓库目标默认分支设为 `main`。
3. 配置 `upstream-chatbox` 指向官方 GitHub 仓库。
4. 从本地参考克隆导入已核实的 Chatbox `main` 对象，再通过一次允许 unrelated histories 的合并保留双方历史。
5. 唯一同路径冲突 `.gitignore` 合并为并集，必须保留 `/参考原项目源码/`。
6. sub2api 源码不导入根仓库历史，仍只作为被忽略的本地 API 参考。

## 备选方案

- 复制 Chatbox 工作树：操作简单，但丢失上游历史，不利于长期同步。
- 从 Chatbox `main` 新建根分支后 cherry-pick bootstrap：同样保留历史，但会让已有根分支成为旁支，历史意图不如一次显式合并清晰。
- 使用 submodule/subtree：不符合“以 Chatbox 为根应用代码”的目标。

## 影响

- 根历史将包含 Chatbox 完整提交链和本项目 bootstrap 提交。
- 首次导入产生一个明确的合并提交。
- 后续上游同步不再使用 unrelated histories，只在独立同步分支合并 `upstream-chatbox/main`。
- Gitee `origin` 的默认分支仍需在首次推送时确认或调整。

## 验证

- `git branch --show-current` 返回 `main` 或批次功能分支。
- `git merge-base --is-ancestor <chatbox-sha> HEAD` 成功。
- `git merge-base --is-ancestor <bootstrap-sha> HEAD` 成功。
- `git check-ignore` 确认本地参考目录仍被排除。
