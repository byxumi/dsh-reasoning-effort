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

#### What the Agent receives

After the plugin is installed and DSH restarts, the Agent automatically gains the following prompt capabilities:

1. **`reasoning-effort` skill registration** — the model can invoke it to view full usage instructions, including:
   - A table of each level (Off/Low/Medium/High/XHigh/Max) and when to use it
   - How to adjust reasoning effort via the model selector
   - The Agent itself cannot change the effort level directly — it should **recommend** the user adjust it through the UI

2. **System prompt injection** — a Reasoning Effort section is added to every conversation's system prompt, so the Agent knows:
   - Reasoning effort is controlled by the user via the Effort menu in the model selector
   - When the user asks to think deeper/shallower, the Agent should guide them to adjust the Effort setting

After installation, you can ask the Agent in a new session: *"Can you control reasoning effort?"* — it will confirm it knows the feature and guide you.

#### Prompt for AI (install)

Copy the following **verbatim** and send it to an AI (DeepSeek / Claude / any model) to install:

```text
Please install the dsh-reasoning-effort reasoning-effort plugin for the DeepSeek Harness "web" Profile.

## Goal
Enable reasoning effort (Effort: off/low/medium/high/xhigh/max) selection in the official model selector.

## Steps
1. Check whether it is already installed: run `dsh --profile web --dump-config` and look for a
   dsh-reasoning-effort entry. If present, tell me "plugin already installed" and skip step 2.
2. Install (run ONLY this command; do not modify any other Profile):
   dsh plugin --profile web add https://codeload.github.com/byxumi/dsh-reasoning-effort/tar.gz/main

## Error handling
- If the command fails with ERR_PNPM_IGNORED_BUILDS or asks to approve build scripts:
  - Open ~/.dsh/profiles/web/pnpm-workspace.yaml
  - Under allowBuilds, change the dsh-reasoning-effort@... key from "set this to true or false" to true
  - Re-run step 2
- If codeload is unreachable, fall back to:
  dsh plugin --profile web add github:byxumi/dsh-reasoning-effort#main

## Verification
Run `dsh --profile web --dump-config` and confirm the output contains:
  # == dsh-reasoning-effort
  - id: reasoning-effort
    name: dsh-reasoning-effort

## Constraints
- Do NOT shut down or restart the running DSH process.
- Do NOT modify any Profile other than "web".
- After finishing, remind me to manually restart the DSH Web Host and report the result.
```

#### Prompt for AI (uninstall)

Copy the following **verbatim** and send it to an AI to uninstall:

```text
Please uninstall the dsh-reasoning-effort reasoning-effort plugin from the DeepSeek Harness "web" Profile.

## Goal
Remove the reasoning effort plugin, restoring DSH to its original state while keeping the user's other config.

## Steps
1. Confirm it is installed: run `dsh --profile web --dump-config` and look for dsh-reasoning-effort.
   If absent, tell me "plugin not installed" and stop.
2. Remove the plugin (run ONLY this command; do not modify any other Profile):
   dsh plugin --profile web remove dsh-reasoning-effort

## Fallback (if remove fails due to network/dependency issues)
- If remove fails, manually edit ~/.dsh/profiles/web/package.json:
  - Delete the dsh-reasoning-effort line from dependencies
  - Delete dsh-reasoning-effort from dsh.profile.bundles
  - Then run: dsh plugin --profile web install
- If pnpm asks to approve build scripts, you may keep that key under allowBuilds in pnpm-workspace.yaml.

## Verification
Run `dsh --profile web --dump-config` and confirm dsh-reasoning-effort no longer appears.

## Constraints
- Do NOT shut down or restart the running DSH process.
- Do NOT modify any Profile other than "web".
- After finishing, remind me to manually restart the DSH Web Host and report the result.
```

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