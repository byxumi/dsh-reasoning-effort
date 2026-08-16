# dsh-reasoning-effort

[**English**](README.en.md) | **中文**

> [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
> [![GitHub Repo](https://img.shields.io/github/stars/byxumi/dsh-reasoning-effort?style=social)](https://github.com/byxumi/dsh-reasoning-effort)

一个正式的 DSH 插件，让官方内置的模型选择器支持**推理强度（Reasoning Effort）**选择。支持任何 provider、任何模型；通过 `dsh plugin` 一键安装。

---

## 中文文档

### 安装方式一：让 Agent 安装（推荐）

如果当前 Agent 可以执行终端命令，把下面这段话完整发送给它：

```text
请帮我为 DeepSeek Harness 的 web Profile 安装推理强度插件。

先检查一下是否已安装，运行：
dsh --profile web --dump-config

如果输出中已经有 dsh-reasoning-effort 条目，告诉我"已安装"即可，不用重复装。
如果还没有，请帮我安装（只操作 web Profile，不要动其他 Profile）：
dsh plugin --profile web add github:byxumi/dsh-reasoning-effort#main

安装完成后，再运行确认一次：
dsh --profile web --dump-config

告诉我最终结果——配置里是否出现了 dsh-reasoning-effort。
全程不要关闭或重启我当前正在运行的 DSH；安装完成后提醒我手动重启 DSH Web Host 才能生效。
```

Agent 应当返回检查结果和安装状态。如果已经安装，它会告诉你"已安装"；如果刚装上，它会汇报配置中已出现 `dsh-reasoning-effort`。

**安装后手动重启 DSH Web Host 使插件生效。**

#### 给 Agent 的卸载提示词

需要卸载时，把下面这段发给 Agent：

```text
请帮我从 DeepSeek Harness 完全卸载推理强度插件。

只执行下面一条命令即可（会清理 pi-ai 补丁、settings.yaml 推理声明和 Profile 配置，一步到位）：
node uninstall.js --all

运行后告诉我结果，并提醒我手动重启 DSH Web Host。
```

#### Agent 获得的提示词

插件安装并重启后，Agent 会自动获得以下提示词能力：

1. **注册 `reasoning-effort` skill**——模型可调用它查看完整使用说明
2. **系统提示词注入**——每次对话的系统提示中加入 Reasoning Effort 段落，Agent 会主动知道推理强度是由用户在模型选择器 Effort 菜单中控制的

安装后，你可以在新会话中直接问 Agent：*"你能控制推理强度吗？"*，Agent 会回答它知道这个功能并指导你使用。

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

一步完成（清理 pi-ai 补丁 + settings.yaml 推理声明 + Profile 配置）：

```bash
node uninstall.js --all
```

> 注意：`uninstall.js` 位于插件包内，运行前请先确认当前目录或全局可访问。
> 如果只想移除 Profile 插件行而不清理配置，可用 `dsh plugin --profile web remove dsh-reasoning-effort`，
> 但推理声明会保留，需配合上面的脚本才彻底。

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

