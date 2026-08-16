# dsh-win-reasoning

> **中文** | [English](#english)

DSH (DeepSeek Harness) 推理强度一键安装工具 — 让**官方内置的模型选择器**支持推理等级（Reasoning Effort）选择。适用于任何 provider、任何模型；Windows / macOS / Linux 全平台。

---

## 中文文档

### 功能

安装后，输入框右侧模型选择器弹出菜单会出现 **Effort（推理等级）** 入口，可选 6 档：

| 等级 | 值 | 说明 |
|------|-----|------|
| 关闭 | `off` | 关闭思考 |
| 低 | `low` | 最小推理 |
| 中 | `medium` | 中等推理 |
| 高 | `high` | 标准推理 |
| 超高 | `xhigh` | 高强度推理 |
| 最大 | `max` | 最大推理 |

所选等级会以 `reasoning_effort` 参数随请求发送给模型网关。

- ✅ **通用**：不绑定任何 provider / 模型
- ✅ **安全**：默认不猜测模型能力、不擅自改配置
- ✅ **幂等**：重复运行自动跳过已配置项
- ✅ **可预览**：`--dry-run` 先看改动再写入

---

### 安装教程

#### 环境要求

- [Node.js](https://nodejs.org) 16+（只需 `node` 命令）
- DSH (DeepSeek Harness) 已安装并可运行

#### 方式一：Windows 双击（最简单）

1. 下载本仓库的最新 [Release](https://github.com/byxumi/dsh-win-reasoning/releases) 的 zip 包
2. 解压后进入文件夹
3. **双击 `install.bat`**
4. 看到 `Done. pi-ai patch applied. Restart DSH to take effect.` 即完成
5. 重启 DSH

#### 方式二：命令行（任意平台）

```bash
cd dsh-win-reasoning
node install.js --off                    # 只打补丁，不碰配置文件
node install.js --provider 你的网关 --models 模型A,模型B  # 写入模型声明
# 重启 DSH
```

#### 方式三：完整流程

```bash
node install.js --list                   # 查看当前配置
node install.js --dry-run --provider my-gw --models m1,m2  # 预览改动
node install.js --provider my-gw --models m1,m2            # 正式安装
```

---

### 脚本做了什么

#### 1. pi-ai compat 透传补丁（通用）

修复 `@deepseek-ai/dsh-llm-pi-ai` 的 `resolveModelCompat`：原先只透传两个 compat 字段，导致 `supportsDeveloperRole` / `supportsStore` / `maxTokensField` 配置被静默丢弃，许多 OpenAI 兼容网关因此返回 400（`developer` role、`store`、`max_completion_tokens` 字段问题）。

补丁后这些字段真正生效。**对任何模型都安全**。原文件自动备份为 `lib/index.js.dsh-reasoning.bak`。

#### 2. 模型推理等级声明（按需）

只有显式指定 `--provider` + `--models` 时才写入 `settings.yaml`。不同模型支持的等级不同，脚本不猜测、不强加：

| 模型类型 | 通常支持的等级 |
|----------|----------------|
| DeepSeek 官方 | `high` / `max` |
| OpenAI o 系列 | `low` / `medium` / `high` |
| GLM / 其他 | 视网关而定 |

---

### 完整配置模板

需要手动配置时，将以下内容合并进 `~/.dsh/settings.yaml`（按你的实际网关修改）：

```yaml
llm-pi-ai:
  providers:
    your-gateway:
      displayName: My Gateway
      apiKeyEnv: YOUR_API_KEY
      api: openai-completions
      baseURL: https://your-gateway.example.com/v1
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

> `supportsDeveloperRole: false` 避免 pi-ai 把 `system` 消息改成 `developer` role。
> `supportsStore: false` / `maxTokensField: max_tokens` 让请求体匹配 OpenAI 兼容网关。

---

### 命令参考

| 命令 | 作用 |
|------|------|
| `install.bat` | Windows 双击一键安装 |
| `node install.js` | 打补丁 + 打印模板 |
| `node install.js --off` | 只打补丁，不改配置文件 |
| `node install.js --provider P --models M1,M2` | 打补丁 + 写入模型声明 |
| `node install.js --list` | 查看当前 provider/模型 |
| `node install.js --dry-run --provider P --models M` | 预览改动 |
| `node install.js --version` | 版本号 |

---

### 问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 400 `developer is not one of [...]` | compat 未透传 `supportsDeveloperRole: false` | 确认补丁已打且模型声明有该字段，重启 |
| 400 未知字段 `store` | `supportsStore` 未设为 false | 模型声明加 `supportsStore: false` |
| 400 未知字段 `max_completion_tokens` | `maxTokensField` 未设 `max_tokens` | 模型声明加 `maxTokensField: max_tokens` |
| 400 `does not support reasoning effort` | 模型不支持某等级 | 只保留模型实际支持的等级 |
| 模型选择器没有 Effort 入口 | 模型未声明 `reasoningEfforts` | 给该模型加声明后重启 |

### 卸载

1. 删除 `settings.yaml` 里你添加的模型声明
2. 恢复 pi-ai 补丁：把 `lib/index.js.dsh-reasoning.bak` 改回 `lib/index.js`

---

<h2 id="english">English</h2>

> [中文](#中文文档) | **English**

One-click installer that enables **reasoning effort selection** in the official DSH model selector. Works with any provider and any model on Windows, macOS, and Linux.

### Features

After installation, the model selector dropdown in the composer bar shows an **Effort** entry with 6 levels:

| Level | Value | Description |
|-------|-------|-------------|
| Off | `off` | Disable thinking |
| Low | `low` | Minimal reasoning |
| Medium | `medium` | Moderate reasoning |
| High | `high` | Standard reasoning |
| XHigh | `xhigh` | High-intensity reasoning |
| Max | `max` | Maximum reasoning |

The selected level is sent as `reasoning_effort` in API requests.

- ✅ **Universal** — works with any provider / model
- ✅ **Safe** — does not guess model capabilities by default
- ✅ **Idempotent** — re-running skips already-configured items
- ✅ **Preview** — `--dry-run` shows changes before writing

### Quick Start

**Requirements:** [Node.js](https://nodejs.org) 16+ and DSH installed.

#### Windows (double-click)

1. Download the latest [Release](https://github.com/byxumi/dsh-win-reasoning/releases) zip
2. Extract and double-click **`install.bat`**
3. Restart DSH

#### Command line (any platform)

```bash
node install.js --off                              # patch only, no config changes
node install.js --provider my-gateway --models m1,m2  # write model declarations
# Restart DSH
```

#### Preview before applying

```bash
node install.js --list                             # inspect current config
node install.js --dry-run --provider my-gw --models m1,m2
```

### What it does

#### 1. pi-ai compat patch (universal)

Fixes `resolveModelCompat` in `@deepseek-ai/dsh-llm-pi-ai` to forward `supportsDeveloperRole`, `supportsStore`, and `maxTokensField` fields. Without this, many OpenAI-compatible gateways return 400 errors (`developer` role, `store`, `max_completion_tokens`).

The original file is backed up as `lib/index.js.dsh-reasoning.bak`. **Safe for all models.**

#### 2. Model declarations (on demand)

Only writes to `settings.yaml` when `--provider` + `--models` are explicitly given. Different models support different levels:

| Model type | Typical levels |
|------------|----------------|
| DeepSeek official | `high` / `max` |
| OpenAI o-series | `low` / `medium` / `high` |
| GLM / others | Depends on gateway |

### Configuration template

Merge into `~/.dsh/settings.yaml`:

```yaml
llm-pi-ai:
  providers:
    your-gateway:
      displayName: My Gateway
      apiKeyEnv: YOUR_API_KEY
      api: openai-completions
      baseURL: https://your-gateway.example.com/v1
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

### CLI Reference

| Command | Description |
|---------|-------------|
| `install.bat` | Windows double-click launcher |
| `node install.js` | Patch + print template |
| `node install.js --off` | Patch only, no config changes |
| `node install.js --provider P --models M1,M2` | Patch + write model declarations |
| `node install.js --list` | List configured providers/models |
| `node install.js --dry-run --provider P --models M` | Preview changes |
| `node install.js --version` | Show version |

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 400 `developer is not one of [...]` | compat not forwarding `supportsDeveloperRole: false` | Ensure patch is applied and the field is in the model declaration, restart |
| 400 unknown field `store` | `supportsStore` not set to false | Add `supportsStore: false` |
| 400 unknown field `max_completion_tokens` | `maxTokensField` not set to `max_tokens` | Add `maxTokensField: max_tokens` |
| 400 `does not support reasoning effort` | Model doesn't support the level | Only list levels your model actually supports |
| No Effort entry in model selector | Model missing `reasoningEfforts` declaration | Add declaration and restart |

### Uninstall

1. Remove model declarations from `settings.yaml`
2. Restore pi-ai patch: rename `lib/index.js.dsh-reasoning.bak` back to `lib/index.js`

---

## License

[MIT](LICENSE)