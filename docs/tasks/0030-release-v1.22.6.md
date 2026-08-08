# 任务 0030：发布 NaoNaoAI Chat v1.22.6

- 状态：代码与标签已推送，GitHub Actions/Release 结果待权限恢复后确认
- 日期：2026-08-08
- 发布版本：`1.22.6`
- 触发标签：`v1.22.6`

## 授权范围

项目所有者已明确授权本轮执行 Git 推送、桌面打包和 Release 发布。

## 发布内容

- 包含此前已完成的 NaoNaoAI 品牌入口和启动过渡动画修复。
- 包含 SiliconFlow、OpenRouter、Ollama 的用户可见入口移除。
- 保留历史 Provider 配置兼容逻辑。
- Release 工作流目标为已认证的 `github-release` 远端。

## 发布前功能测试计划

- Provider 可见性、品牌入口和旧配置迁移回归测试。
- TypeScript 类型检查。
- Biome 检查与 `git diff --check`。
- 全量 Vitest、Lint 和生产构建。
- GitHub Actions Windows/macOS 打包及 Release 资产上传。

## 发布验收标准

- 本地发布前测试全部实际执行并记录结果。
- `release/app/package.json` 版本与 `v1.22.6` 一致。
- GitHub 远端 `main` 和 `v1.22.6` 标签推送成功。
- Windows/macOS 工作流成功生成安装包，Release 页面包含 `.exe`、`.dmg` 和 `.zip`。
- Gitee `origin` 推送结果单独记录；无权限时不得写成成功。

## 已执行结果

- `corepack pnpm install --frozen-lockfile`：根依赖解析完成；`release/app` 本机 postinstall 因缺少其本地 Electron 版本失败，随后使用 `--ignore-scripts` 完成锁定依赖恢复。
- 定向 Provider/品牌/迁移测试：4 个测试文件、19 项通过。
- 单 worker 全量 Vitest：249 个测试文件中 246 个通过、3 个跳过；2524 项中 2463 项通过、61 项跳过。
- TypeScript：通过，0 error。
- 全量 Biome lint：0 error，保留 888 个既有 warning。
- 变更文件 Biome check：通过。
- 生产 `electron-vite build`：通过；保留既有构建 warning。
- 本地安装包打包：按项目所有者最新要求未执行。
- Git 推送：已完成；GitHub Actions/Release 资产：待权限恢复后确认。

## 推送结果

- `github-release/main` 已推送至提交 `6198edcb`。
- `github-release` 的 `v1.22.6` 标签已推送，未移动或覆盖既有标签。
- 按 `.github/workflows/desktop-packages.yml` 的触发规则，标签推送已触发 Windows/macOS 打包与 Release 流程。
- 当前环境没有 `gh` CLI；GitHub Actions API 返回 HTTP 403，Release 页面请求也无法建立，Windows/macOS 制品和 Release 资产尚未确认。
- Gitee `origin` 推送失败：SSH `Permission denied (publickey)`；未将其记录为成功。
