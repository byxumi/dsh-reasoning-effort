# Contributing Guide

感谢你考虑为 **dsh-reasoning-effort** 贡献代码。

## 目录

- [开发环境](#开发环境)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [问题反馈](#问题反馈)

## 开发环境

本项目基于 [Node.js](https://nodejs.org) (≥16)，无需安装其他依赖即可运行脚本。

```bash
# 克隆仓库
git clone https://github.com/byxumi/dsh-reasoning-effort.git
cd dsh-reasoning-effort

# 快速自检（打 pi-ai 补丁，不改配置文件）
node install.js --off --dry-run
```

## 代码规范

1. **纯 JavaScript**：本项目是 DSH (Cordis) 插件，运行时不经过 TypeScript 转译，请使用标准 ES2020+ JavaScript。
2. **不使用 Node 全局变量**：`process`、`Buffer`、`setTimeout` 等可能不可用——这是 DSH 插件运行时的限制。如需这些能力，请通过 `ctx.get('...')` 获取对应服务。
3. **资源必须可回收**：所有注册的 timer、事件监听、Slot、Tool 都要通过 `ctx.effect()` / `ctx.on()` 挂载，确保 stop/update 后自动清理。
4. **兼容性**：脚本需同时支持 Windows / macOS / Linux，无需依赖平台特定工具。
5. **语义化输出**：CLI 输出保持中英双语可读，错误信息要给出可操作的建议。

## 提交规范

提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <description>

# 例：
fix(install): preserve all lines before resolveModelCompat
feat(uninstall): multi-location revert
docs: split README into zh/en
```

常用 type：`fix`、`feat`、`docs`、`chore`、`refactor`、`test`。

## Pull Request 流程

1. Fork 本仓库并创建功能分支：`git checkout -b feat/my-change`
2. 提交你的修改（遵循上述规范）
3. 确保测试通过（如有测试脚本）：`node test.js` 或自检脚本
4. 发起 PR 到 `main` 分支，描述你的改动和验证方式
5. 维护者 review 后合并

## 问题反馈

请通过 [GitHub Issues](https://github.com/byxumi/dsh-reasoning-effort/issues) 提交：

- 运行环境：操作系统、Node 版本、DSH 版本
- 安装方式：`dsh plugin` 还是手动脚本
- 完整报错信息（不要截断）

---

## Contributors / 贡献者

感谢以下贡献者：

- [byxumi](https://github.com/byxumi) — 创建者/维护者

---

本项目基于 [MIT License](LICENSE)。