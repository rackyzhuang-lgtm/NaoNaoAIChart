# TASK-0002：忽略本地上游参考源码

- 状态：Done
- 负责人：主 Agent
- 关联 ADR：ADR-0001

## 目标

确保本地克隆的 Chatbox 与 sub2api 参考源码不会进入本仓库提交或推送范围。

## 范围

- 在根 `.gitignore` 中忽略 `/参考原项目源码/`。
- 确认目录中的 `chatbox`、`sub2api` 均为独立 Git 仓库。
- 在项目状态中记录该本地参考目录。

## 非目标

- 不修改参考仓库内容。
- 不将参考仓库作为 submodule、subtree 或 vendored 源码。
- 不修改主仓库 remote、分支或提交历史。

## 验收标准

- [x] `参考原项目源码/chatbox` 与 `参考原项目源码/sub2api` 已确认存在。
- [x] 根仓库忽略整个 `参考原项目源码/`。
- [x] `git status` 不再显示该目录。

## 验证命令

```powershell
git check-ignore -v -- "参考原项目源码/chatbox" "参考原项目源码/sub2api"
git status --short --branch
git diff --check
```

## 结果

两个上游克隆保留在本机用于只读分析，由根 `.gitignore` 排除，不参与主仓库提交和推送。
