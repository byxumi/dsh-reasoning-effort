# dsh-reasoning-effort

> **中文** | [English](#english)

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

### 安装方式二：手动脚本安装

若你的网络环境无法直连 GitHub（`github:byxumi/dsh-reasoning-effort#main` 安装失败），
可以用 **codeload 源码包 URL** 安装（codeload.github.com 通常可访问）：

```bash
# 用 codeload tarball URL 代替 github: 语法
dsh plugin --profile web add https://codeload.github.com/byxumi/dsh-reasoning-effort/tar.gz/main

# 若 pnpm 提示构建脚本需批准，编辑 pnpm-workspace.yaml：
# 在 allowBuilds 中添加对应 key 设为 true
# 然后重新运行 add 命令
```

验证是否已作为 profile layer 挂载：

```bash
dsh --profile web --dump-config
```

输出中应看到：
```
# == dsh-reasoning-effort
- id: reasoning-effort
  name: dsh-reasoning-effort
```

### 安装方式二：手动脚本（无需成为插件）

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
| `plugins` 未作为 layer 挂载 | 包未声明 `dsh.bundle` | 确认 `package.json` 有 `dsh.bundle.patch` |

---

<h2 id="english">English</h2>

> [中文](#中文文档) | **English**

A DSH plugin that enables **reasoning effort selection** in the official model selector. Works with any provider and any model.

### Method 1: Agent one-click install (recommended)

Use DSH's built-in `dsh plugin` proxy command to mount the plugin into the web Profile:

```bash
# Install dsh-reasoning-effort into the web Profile
dsh plugin --profile web add https://codeload.github.com/byxumi/dsh-reasoning-effort/tar.gz/main

# Confirm the plugin is registered as a profile layer
dsh --profile web --dump-config
```

You should see a `dsh-reasoning-effort` entry in the output.

> If your network can reach GitHub directly, the `github:` shorthand also works:
> ```bash
> dsh plugin --profile web add github:byxumi/dsh-reasoning-effort#main
> ```
> If pnpm blocks build scripts, approve the package in `pnpm-workspace.yaml` under `allowBuilds`, then re-run.

**After installation, manually restart the DSH Web Host for the plugin to take effect.**

### Alternative: codeload tarball (recommended for restricted networks)

If `github:byxumi/dsh-reasoning-effort#main` fails due to network restrictions, use:

```bash
dsh plugin --profile web add https://codeload.github.com/byxumi/dsh-reasoning-effort/tar.gz/main
```

If pnpm blocks build scripts, approve the package in `pnpm-workspace.yaml` under `allowBuilds`, then re-run.

Verify with `dsh --profile web --dump-config` — you should see:
```
# == dsh-reasoning-effort
- id: reasoning-effort
  name: dsh-reasoning-effort
```

### Manual install (non-plugin)

```bash
node install.js --off
node install.js --provider your-gateway --models model-a,model-b
```

### Uninstall

```bash
dsh plugin --profile web remove dsh-reasoning-effort
# or via script:
node uninstall.js --all
```

### Configuration template

```yaml
llm-pi-ai:
  providers:
    your-gateway:
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

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 400 `developer is not one of [...]` | compat not forwarding `supportsDeveloperRole: false` | Ensure pi-ai patch is applied, restart |
| 400 unknown `store` | `supportsStore` not false | Add `supportsStore: false` |
| No Effort entry | model missing `reasoningEfforts` | Add declaration and restart |
| Not mounted as layer | package missing `dsh.bundle` | Check `package.json` has `dsh.bundle.patch` |

---

## License

[MIT](LICENSE)