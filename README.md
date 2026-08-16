# dsh-win-reasoning

> DSH (DeepSeek Harness) 推理强度一键安装工具 — 让**官方内置的模型选择器**支持推理等级（Reasoning Effort）选择。适用于任何 provider、任何模型；Windows / macOS / Linux 全平台。

## 功能

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

## 安装教程

### 环境要求

- [Node.js](https://nodejs.org) 16+（只需 `node` 命令）
- DSH (DeepSeek Harness) 已安装并可运行

### 方式一：Windows 双击（最简单）

1. 下载本仓库，解压（或 `git clone`）
2. 进入 `dsh-win-reasoning` 文件夹
3. **双击 `install.bat`**
4. 看到 `Done. pi-ai patch applied. Restart DSH to take effect.` 即完成
5. 重启 DSH

### 方式二：命令行（任意平台）

```bash
# 1. 进入仓库目录
cd dsh-win-reasoning

# 2. 只打 pi-ai 补丁（不碰任何配置文件，最安全）
node install.js --off

# 3.（可选）自动为目标 provider/模型写入推理等级声明
node install.js --provider 你的网关 --models 模型A,模型B

# 4. 重启 DSH
```

### 方式三：完整流程示例

```bash
# 查看当前已配置的 provider 和模型
node install.js --list

# 预览将要做出的改动（不写入）
node install.js --dry-run --provider my-gateway --models model-a,model-b

# 确认无误后正式安装
node install.js --provider my-gateway --models model-a,model-b
```

---

## 脚本做了什么

### 1. pi-ai compat 透传补丁（通用）

修复 `@deepseek-ai/dsh-llm-pi-ai` 的 `resolveModelCompat`：原先只透传两个 compat 字段，导致 `supportsDeveloperRole` / `supportsStore` / `maxTokensField` 配置被静默丢弃，许多 OpenAI 兼容网关因此返回 400（`developer` role、`store`、`max_completion_tokens` 字段问题）。

补丁后这些字段真正生效。**对任何模型都安全**。原文件自动备份为 `lib/index.js.dsh-reasoning.bak`。

### 2. 模型推理等级声明（按需）

只有显式指定 `--provider` + `--models` 时才写入 `settings.yaml`。不同模型支持的等级不同，脚本不猜测、不强加：

| 模型类型 | 通常支持的等级 |
|----------|----------------|
| DeepSeek 官方 | `high` / `max` |
| OpenAI o 系列 | `low` / `medium` / `high` |
| GLM / 其他 | 视网关而定 |

---

## 完整配置模板

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

## 命令参考

| 命令 | 作用 |
|------|------|
| `install.bat` | Windows 双击一键安装 |
| `node install.js` | 打补丁 + 打印模板 |
| `node install.js --off` | 只打补丁，不改配置文件 |
| `node install.js --provider P --models M1,M2` | 打补丁 + 写入模型声明 |
| `node install.js --list` | 查看当前 provider/模型 |
| `node install.js --dry-run --provider P --models M` | 预览改动 |
| `node install.js --pi-ai <路径>` | 指定 pi-ai 包路径 |
| `node install.js --settings <路径>` | 指定 settings.yaml 路径 |
| `node install.js --version` | 版本号 |

---

## FAQ / 问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 400 `developer is not one of [...]` | compat 未透传 `supportsDeveloperRole: false` | 确认补丁已打且模型声明有该字段，重启 |
| 400 未知字段 `store` | `supportsStore` 未设为 false | 模型声明加 `supportsStore: false` |
| 400 未知字段 `max_completion_tokens` | `maxTokensField` 未设 `max_tokens` | 模型声明加 `maxTokensField: max_tokens` |
| 400 `does not support reasoning effort` | 模型不支持某等级 | 只保留模型实际支持的等级 |
| 模型选择器没有 Effort 入口 | 模型未声明 `reasoningEfforts` | 给该模型加声明后重启 |
| 有些模型能用、有些不能 | 不同模型能力不同 | 按模型分别声明不同等级 |
| 提示 `not found` pi-ai 包 | 脚本找不到安装路径 | 用 `--pi-ai` 指定完整路径 |

## 卸载

1. 删除 `settings.yaml` 里你添加的模型声明
2. 恢复 pi-ai 补丁：把 `lib/index.js.dsh-reasoning.bak` 改回 `lib/index.js`

---

## License

[MIT](LICENSE)