# 任务 0029：移除三个模型提供方的用户可见入口

- 状态：已完成
- 日期：2026-08-08
- 范围：SiliconFlow、OpenRouter、Ollama

## 目标

从模型提供方的用户可见入口中移除 SiliconFlow、OpenRouter 和 Ollama，避免它们继续出现在提供方菜单、推荐列表、Provider Spotlight、设置页列表和已配置模型选择集合中。

## 兼容边界

- 保留三个 Provider 的 `ModelProviderEnum`、注册定义、模型实现和迁移/配置读取逻辑。
- 不删除历史配置；旧配置仍可被底层代码读取。
- 本任务不修改 sub2api 服务端行为，不执行打包、推送或 Release 发布。

## 实施内容

- 新增共享 Provider 可见性规则，集中维护隐藏 Provider ID。
- 从旧的模型提供方菜单选项中移除三个 Provider。
- 对设置 Provider 列表、Provider Spotlight 和 `useProviders` 应用统一过滤。
- 保留底层 Provider 注册，以支持历史会话和配置兼容。

## 功能测试计划与结果

- 菜单选项不包含三个隐藏 Provider：通过。
- 推荐列表不包含三个隐藏 Provider：通过。
- 系统 Provider 的可见集合不包含三个隐藏 Provider，其他 Provider 仍存在：通过。
- 品牌回归和旧配置迁移回归：通过；4 个测试文件、19 项通过。
- TypeScript 类型检查：通过，0 error。
- Biome 检查：通过，变更相关源码 0 error。
- `git diff --check`：通过。
