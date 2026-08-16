# dsh-reasoning-effort

**English** | [中文](README.md)

> [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
> [![GitHub Repo](https://img.shields.io/github/stars/byxumi/dsh-reasoning-effort?style=social)](https://github.com/byxumi/dsh-reasoning-effort)

A DSH plugin that enables **reasoning effort selection** in the official model selector. Works with any provider and any model. Install with one `dsh plugin` command.

---

## English Documentation

### Method 1: Let the Agent install (recommended)

If your current Agent can execute terminal commands, send the following text verbatim to it:

```text
Could you help me install the reasoning-effort plugin for the DeepSeek Harness "web" Profile?

First, check whether it's already there:
dsh --profile web --dump-config

If dsh-reasoning-effort already appears in the output, just tell me "already installed" and stop.
If not, install it (only modify the web Profile, leave others alone):
dsh plugin --profile web add github:byxumi/dsh-reasoning-effort#main

After installation, verify again:
dsh --profile web --dump-config

Tell me the result — whether dsh-reasoning-effort now appears in the config.
Do NOT shut down or restart the running DSH process; remind me to manually restart the DSH Web Host afterwards.
```

The Agent should check first, then install if needed, and report the final status.

**After installation, manually restart the DSH Web Host for the plugin to take effect.**

#### Prompt for Agent (uninstall)

To uninstall, send the following:

```text
Could you help me fully uninstall the reasoning-effort plugin from DeepSeek Harness?

Follow these steps:
1. Find or download the uninstall script (uninstall.js):
   - If uninstall.js already exists in the current directory or ~/.dsh/, skip the download.
   - Otherwise download it with curl:
     curl -fsSL -o uninstall.js https://raw.githubusercontent.com/byxumi/dsh-reasoning-effort/main/uninstall.js
   - If curl is unavailable (legacy Windows), use PowerShell:
     Invoke-WebRequest -Uri https://raw.githubusercontent.com/byxumi/dsh-reasoning-effort/main/uninstall.js -OutFile uninstall.js
2. Run (cleans pi-ai patches, settings.yaml declarations, and Profile config — all in one step):
   node uninstall.js --all
3. If node is also unavailable, just tell me "Node.js missing" — don't force-install anything.

Tell me the result and remind me to restart the DSH Web Host.
```

#### What the Agent receives

After the plugin is installed and DSH restarts, the Agent automatically gains:

1. **`reasoning-effort` skill registration** — the model can invoke it to view usage instructions
2. **System prompt injection** — a Reasoning Effort section is added to every conversation's system prompt

After installation, ask the Agent in a new session: *"Can you control reasoning effort?"* — it will confirm it knows the feature and guide you.

### Features

| Level | Value | Description |
|-------|-------|-------------|
| Off | `off` | Disable thinking |
| Low | `low` | Minimal reasoning |
| Medium | `medium` | Moderate reasoning |
| High | `high` | Standard reasoning |
| XHigh | `xhigh` | High-intensity reasoning |
| Max | `max` | Maximum reasoning |

The selected level is sent as `reasoning_effort` in API requests.

### What the plugin does

1. **Registers the `reasoning-effort` skill** — callable by the model/user to view instructions
2. **Key point**: when mounted as a profile bundle, combined with `reasoningEfforts` declarations in
   `settings.yaml`, the official model selector automatically shows the Effort entry

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

> `supportsDeveloperRole: false` prevents pi-ai from sending `system` as `developer` role.
> `supportsStore: false` / `maxTokensField: max_tokens` keep the request body compatible with OpenAI-style gateways.

### Uninstall

```bash
dsh plugin --profile web remove dsh-reasoning-effort
# or via script:
node uninstall.js --all
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

## Community

- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)
