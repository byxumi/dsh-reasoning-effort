# dsh-reasoning-effort

**English** | [中文](README.md)

> [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
> [![GitHub Repo](https://img.shields.io/github/stars/byxumi/dsh-reasoning-effort?style=social)](https://github.com/byxumi/dsh-reasoning-effort)

A DSH plugin that enables **reasoning effort selection** in the official model selector. Works with any provider and any model. Install with one `dsh plugin` command.

---

## English Documentation

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

### Method 2: codeload tarball (for restricted networks)

If `github:byxumi/dsh-reasoning-effort#main` fails due to network restrictions, codeload.github.com is usually reachable:

```bash
dsh plugin --profile web add https://codeload.github.com/byxumi/dsh-reasoning-effort/tar.gz/main
```

If pnpm blocks build scripts, set the corresponding key to `true` under `allowBuilds` in `pnpm-workspace.yaml`, then re-run.

Verify mounting:

```bash
dsh --profile web --dump-config
```

You should see:

```
# == dsh-reasoning-effort
- id: reasoning-effort
  name: dsh-reasoning-effort
```

### Method 3: Manual script (non-plugin)

```bash
# Windows: double-click install.bat
# or command line:
node install.js --off                    # patch pi-ai only
node install.js --provider your-gateway --models model-a,model-b   # write model declarations
```

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