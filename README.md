# DSH 推理强度选择器（Reasoning Effort）通用安装包

让 DSH **官方内置的模型选择器**支持推理强度（reasoning effort）选择。

**通用性**：不绑定任何特定模型供应商或模型。`pi-ai` 补丁对所有模型安全；模型声明按你显式指定的 provider/模型写入，脚本不猜测、不强加。

安装后，输入框右侧模型选择器弹出菜单会出现 **Effort（推理等级）** 入口：

| 等级 | 值 | 说明 |
|------|-----|------|
| 关闭 | `off` | 关闭思考 |
| 低 | `low` | 最小推理 |
| 中 | `medium` | 中等推理 |
| 高 | `high` | 标准推理 |
| 超高 | `xhigh` | 高强度推理 |
| 最大 | `max` | 最大推理 |

选择的等级以 `reasoning_effort` 参数随请求发送给模型网关。

---

## 一键安装（Windows）

双击 **`install.bat`**，或命令行运行：

```bash
node install.js
```

不带参数时脚本**只打 pi-ai 补丁**（通用安全修复），并打印一份通用配置模板供你参考——不会擅自改动你的 settings.yaml。

## 指定自己的 provider 和模型

```bash
# 任意 provider 名称、任意模型 id
node install.js --provider my-provider --models model-a,model-b
node install.js --provider openai --models gpt-5
node install.js --provider custom --models my-model-a,my-model-b
```

脚本会把 6 档推理等级声明写进这些模型，然后重启 DSH 生效。

## 只打补丁、完全不碰配置文件

```bash
node install.js --off
```

---

## 脚本做了什么

### 1. pi-ai compat 透传补丁（通用，所有模型受益）

修复 `@deepseek-ai/dsh-llm-pi-ai` 的 `resolveModelCompat`：原先只透传两个 compat 字段，导致 `supportsDeveloperRole` / `supportsStore` / `maxTokensField` 配置被静默丢弃，许多 OpenAI 兼容网关因此返回 400（`developer` role、`store`、`max_completion_tokens` 字段问题）。

补丁后这些字段真正生效，**对任何模型都安全**。已打补丁时重复运行会自动跳过（幂等），原文件备份为 `lib/index.js.dsh-reasoning.bak`。

### 2. 模型推理等级声明（按需，不猜测）

只有当你显式指定 `--provider` 和 `--models` 时才写入 settings.yaml。**不同模型支持的等级不同**：

| 模型类型 | 通常支持的等级 |
|----------|----------------|
| DeepSeek 官方 | `high` / `max` |
| OpenAI o 系列 | `low` / `medium` / `high` |
| GLM / 其他 | 视网关而定 |

所以脚本默认不替你做决定——用 `--off` 或空参数运行不会动你的配置，手动参考打印的模板填写更稳妥。

---

## 手动配置（无脚本）

### 1. pi-ai 补丁

编辑 `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js`，把 `resolveModelCompat` 改为：

```js
function resolveModelCompat(provider, entry, route, base, api) {
	const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;
	const supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;
	const supportsDeveloperRole = entry.compat?.supportsDeveloperRole ?? route?.supportsDeveloperRole;
	const supportsStore = entry.compat?.supportsStore ?? route?.supportsStore;
	const maxTokensField = entry.compat?.maxTokensField ?? route?.maxTokensField;
	if (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};
	if (api !== "openai-completions") {
		if (entry.compat?.thinkingFormat !== void 0 || entry.compat?.supportsReasoningEffort !== void 0) invalid(provider, `model "${entry.id}" sets compat reasoning switches, but its api is "${api}"; thinkingFormat and supportsReasoningEffort exist only on openai-completions`);
		return {};
	}
	return { compat: {
		...base?.api === api ? base.compat : void 0,
		...thinkingFormat === void 0 ? {} : { thinkingFormat },
		...supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort },
		...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole },
		...supportsStore === void 0 ? {} : { supportsStore },
		...maxTokensField === void 0 ? {} : { maxTokensField }
	} };
}
```

### 2. settings.yaml 声明（按模型实际能力）

在 `$HOME/.dsh/settings.yaml` 的 `llm-pi-ai.providers.<你的provider>.models` 下：

```yaml
llm-pi-ai:
  providers:
    你的provider:
      displayName: 显示名称
      apiKeyEnv: YOUR_API_KEY_ENV
      api: openai-completions
      baseURL: https://your-gateway/v1
      models:
        - id: 你的模型
          name: 你的模型
          compat:
            supportsReasoningEffort: true
            supportsDeveloperRole: false
            supportsStore: false
            maxTokensField: max_tokens
          reasoningEfforts:   # 只列模型真正支持的等级
            off: null
            low: low
            medium: medium
            high: high
            xhigh: xhigh
            max: max
```

> `supportsDeveloperRole: false` 避免 pi-ai 把 `system` 改成 `developer` role。
> `supportsStore: false` / `maxTokensField: max_tokens` 让请求体匹配 OpenAI 兼容网关。

### 3. 重启 DSH

---

## 问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 400 `developer is not one of [...]` | compat 未透传 `supportsDeveloperRole: false` | 确认补丁已打且模型声明里有该字段，重启 |
| 400 未知字段 `store` | `supportsStore` 未设为 false | 模型声明加 `supportsStore: false` |
| 400 未知字段 `max_completion_tokens` | `maxTokensField` 未设 `max_tokens` | 模型声明加 `maxTokensField: max_tokens` |
| 400 `does not support reasoning effort` | 模型不支持某等级 | 只保留模型实际支持的等级 |
| 模型选择器没有 Effort 入口 | 模型未声明 `reasoningEfforts` | 给该模型加声明后重启 |
| 有些模型能用、有些不能 | 不同模型能力不同 | 按模型分别声明不同等级 |

## 卸载

- 删除 settings.yaml 里你添加的模型声明
- 恢复 pi-ai 补丁：把 `lib/index.js.dsh-reasoning.bak` 改回 `lib/index.js`