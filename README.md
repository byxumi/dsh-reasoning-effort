# dsh-reasoning-effort

[**English**](README.en.md) | **中文**

> [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
> [![GitHub Repo](https://img.shields.io/github/stars/byxumi/dsh-reasoning-effort?style=social)](https://github.com/byxumi/dsh-reasoning-effort)

一个正式的 DSH 插件，让官方内置的模型选择器支持**推理强度（Reasoning Effort）**选择。支持任何 provider、任何模型；通过 `dsh plugin` 一键安装。

---

## 中文文档

### 安装方式一：Agent 一键安装（推荐）

通过 DSH 内置的 `dsh plugin` 代理命令，将插件挂载到 web Profile：

```bash
# 安装 dsh-reasoning-effort 插件到 web Profile
dsh plugin --profile web add https://codeload.github.com/byxumi/dsh-reasoning-effort/tar.gz/main

# 确认插件已注册为 profile layer
dsh --profile web --dump-config
```

输出中应出现 `dsh-reasoning-effort` 的条目，说明插件已挂载成功。

> 若网络环境支持直连 GitHub，也可用 `github:byxumi/dsh-reasoning-effort#main` 语法：
> ```bash
> dsh plugin --profile web add github:byxumi/dsh-reasoning-effort#main
> ```
> 如果 pnpm 提示构建脚本需批准，编辑 `pnpm-workspace.yaml` 的 `allowBuilds` 添加对应 key 后重试。

**安装完成后，手动重启 DSH Web Host 使插件生效。**

#### Agent 获得的提示词

插件安装并重启后，Agent 会自动获得以下提示词能力：

1. **注册 `reasoning-effort` skill**——模型可调用它查看完整使用说明，包括：
   - 各等级（Off/Low/Medium/High/XHigh/Max）的适用场景表
   - 如何通过模型选择器调整推理强度
   - Agent 自身无法直接改推理强度，只能**建议用户**通过 UI 调整

2. **系统提示词注入**——每次对话的系统提示中加入 Reasoning Effort 段落，Agent 会主动知道：
   - 推理强度是由用户在输入框的模型选择器 Effort 菜单中控制的
   - 当用户要求加深/减浅思考时，Agent 应引导用户调整 Effort 设置

安装后，你可以在新会话中直接问 Agent：*"你能控制推理强度吗？"*，Agent 会回答它知道这个功能并指导你使用。

### 安装方式二：codeload 源码包（网络受限时）

若 `github:byxumi/dsh-reasoning-effort#main` 因网络限制失败，codeload.github.com 通常可达：

```bash
dsh plugin --profile web add https://codeload.github.com/byxumi/dsh-reasoning-effort/tar.gz/main
```

若 pnpm 提示构建脚本需批准，在 `pnpm-workspace.yaml` 的 `allowBuilds` 中把对应 key 设为 `true`，然后重试。

验证挂载：

```bash
dsh --profile web --dump-config
```

输出中应看到：

```
# == dsh-reasoning-effort
- id: reasoning-effort
  name: dsh-reasoning-effort
```

### 安装方式三：手动脚本（无需成为插件）

```bash
# Windows: 双击 install.bat
# 或命令行：
node install.js --off                    # 只打 pi-ai 补丁
node install.js --provider 你的网关 --models 模型A,模型B   # 写入模型声明
```

### 功能

| 等级 | 值 | 说明 |
|------|-----|------|
| 关闭 | `off` | 关闭思考 |
| 低 | `low` | 最小推理 |
| 中 | `medium` | 中等推理 |
| 高 | `high` | 标准推理 |
| 超高 | `xhigh` | 高强度推理 |
| 最大 | `max` | 最大推理 |

所选等级会以 `reasoning_effort` 参数随请求发送给模型网关。

### 插件做了什么

1. **注册推理等级 skill**（`reasoning-effort`），可被模型/用户调用查看说明
2. **最关键的是**：作为 profile bundle 挂载后，配合 `settings.yaml` 中模型声明的
   `reasoningEfforts`，官方模型选择器自动显示 Effort 入口

### 配置模板

```yaml
llm-pi-ai:
  providers:
    你的provider:
      api: openai-completions
      baseURL: https://your-gateway/v1
      models:
        - id: your-model
          name: your-model
          compat:
            supportsReasoningEffort: true
            supportsDeveloperRole: false
            supportsStore: false
            maxTokensField: max_tokens
          reasoningEfforts:
            off: null
            low: low
            medium: medium
            high: high
            xhigh: xhigh
            max: max
```

> `supportsDeveloperRole: false` 避免 pi-ai 把 `system` 改成 `developer` role。
> `supportsStore: false` / `maxTokensField: max_tokens` 让请求体匹配 OpenAI 兼容网关。

### 卸载

```bash
dsh plugin --profile web remove dsh-reasoning-effort
# 或手动脚本:
node uninstall.js --all
```

### 问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 400 `developer is not one of [...]` | compat 未透传 `supportsDeveloperRole: false` | 确认 pi-ai 补丁已打，重启 |
| 400 未知字段 `store` | `supportsStore` 未设为 false | 模型声明加 `supportsStore: false` |
| 模型选择器没有 Effort 入口 | 模型未声明 `reasoningEfforts` | 给该模型加声明后重启 |
| 插件未作为 layer 挂载 | 包未声明 `dsh.bundle` | 确认 `package.json` 有 `dsh.bundle.patch` |

---

## License

[MIT](LICENSE)

## 社区文档

- [贡献指南](CONTRIBUTING.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [安全政策](SECURITY.md)