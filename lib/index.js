'use strict'

const name = 'reasoning-effort'
const { applyPiAiPatch, isPiAiPatched } = require('./patch')

/**
 * Self-heal settings.yaml: add reasoning effort declarations for pi-ai models
 * that lack them. Runs at plugin load so the official model selector exposes
 * the Effort entry even when no installer script ran (pnpm 11 blocks lifecycle
 * scripts by default — the Agent install path relies on this self-heal).
 */
function selfHealSettings() {
  try {
    const fs = require('fs')
    const path = require('path')
    const os = require('os')

    const settingsPath = path.join(os.homedir(), '.dsh', 'settings.yaml')
    if (!fs.existsSync(settingsPath)) return
    let text = fs.readFileSync(settingsPath, 'utf8')
    const lines = text.split(/\r?\n/)

    const indentOf = (line) => { const m = (line || '').match(/^\s*/); return m ? m[0].length : 0 }
    const trimmed = (line) => (line || '').trim()

    // --- Locate llm-pi-ai.providers.<name>.models entries ---
    let changed = false
    // Collect all model lines at indent 8 (inside a provider's models list)
    const providerStarts = [] // { name, modelsListIdx }
    for (let i = 0; i < lines.length; i++) {
      const t = trimmed(lines[i])
      if (indentOf(lines[i]) === 4 && /^[^#\s][^\s:]*:$/.test(t)) {
        providerStarts.push({ name: t.replace(/:$/, ''), idx: i })
      }
    }

    for (const p of providerStarts) {
      // find "models:" under this provider (indent 6)
      let modelsIdx = -1
      for (let i = p.idx + 1; i < lines.length; i++) {
        if (indentOf(lines[i]) === 6 && trimmed(lines[i]) === 'models:') { modelsIdx = i; break }
        if (indentOf(lines[i]) < 4) break
      }
      if (modelsIdx < 0) continue

      // walk model entries (indent 8 `- id:`)
      let i = modelsIdx + 1
      while (i < lines.length) {
        if (indentOf(lines[i]) < 6) break
        if (indentOf(lines[i]) === 8 && trimmed(lines[i]).startsWith('- id:')) {
          // model entry start: find its end (next indent-8 dash or indent-6 line)
          let j = i + 1
          let ends = lines.length
          while (j < lines.length) {
            const ind = indentOf(lines[j])
            if (ind === 8 && trimmed(lines[j]).startsWith('- id:')) { ends = j; break }
            if (ind < 8) { ends = j; break }
            j++
          }
          // Does this model block already declare reasoningEfforts?
          let has = false
          for (let k = i; k < ends; k++) {
            if (indentOf(lines[k]) === 10 && trimmed(lines[k]).startsWith('reasoningEfforts:')) { has = true; break }
          }
          if (!has) {
            const block = [
              '          compat:',
              '            supportsReasoningEffort: true',
              '            supportsDeveloperRole: false',
              '            supportsStore: false',
              '            maxTokensField: max_tokens',
              '          reasoningEfforts:',
              '            off: null',
              '            low: low',
              '            medium: medium',
              '            high: high',
              '            xhigh: xhigh',
              '            max: max'
            ]
            lines.splice(ends, 0, ...block)
            changed = true
            // keep scanning from after the inserted block
            i = ends + block.length
            continue
          }
          i = ends
        } else {
          i++
        }
      }
    }

    if (changed) {
      fs.writeFileSync(settingsPath, lines.join('\n'), 'utf8')
      // eslint-disable-next-line no-console
      console.log('[dsh-reasoning-effort] added reasoning effort declarations to settings.yaml')
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dsh-reasoning-effort] settings self-heal skipped: ' + (err && err.message))
  }
}

/**
 * Self-heal: ensure the pi-ai adapter carries the compat patch.
 * Runs at plugin load so reasoning effort works even when pnpm skipped
 * the install script (pnpm 11 blocks lifecycle scripts by default).
 */
function selfHealPiAi() {
  try {
    const fs = require('fs')
    const path = require('path')
    const os = require('os')

    const candidates = []
    const add = (p) => {
      if (p && fs.existsSync(p) && !candidates.includes(p)) candidates.push(p)
    }

    // 1. Profile-local adapter (this plugin's own install target)
    add(path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js'))
    // 2. Global npm nested (dsh's own pi-ai)
    add(path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js'))
    // 3. Desktop runtime
    const desktopCandidates = []
    for (const drive of ['C:', 'D:', 'E:', 'F:', 'G:']) {
      if (fs.existsSync(drive + '/')) desktopCandidates.push(drive + '/deepseek harness/resources/runtime/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js')
    }
    desktopCandidates.forEach(add)

    for (const loc of candidates) {
      if (!isPiAiPatched(loc)) {
        applyPiAiPatch(loc, false)
        // eslint-disable-next-line no-console
        console.log(`[dsh-reasoning-effort] patched pi-ai adapter at ${loc}`)
      }
    }
  } catch (err) {
    // Non-fatal: if patching fails (e.g. permissions), reasoning still 'works'
    // for models whose gateway accepts defaults; just log.
    // eslint-disable-next-line no-console
    console.warn('[dsh-reasoning-effort] self-heal patch skipped: ' + (err && err.message))
  }
}

/** Register the reasoning-effort skill and a system prompt section. */
function apply(ctx) {
  selfHealPiAi()
  selfHealSettings()

  // Register reasoning-effort skill with comprehensive agent instructions
  const skills = ctx.get('skills')
  if (skills !== undefined) {
    skills.register({
      name: 'reasoning-effort',
      description: 'Control reasoning effort (thinking depth) for model calls. Allows setting low/medium/high/xhigh/max levels.',
      whenToUse: 'Use when the user asks to adjust thinking depth, or when you need to reason at a specific depth for a task.',
      content: '# Reasoning Effort Control\n\n' +
        'Reasoning effort controls how deeply the model thinks before responding. Different tasks benefit from different levels of reasoning depth.\n\n' +
        '## Available Levels\n\n' +
        '| Level | Value | When to use |\n' +
        '|-------|-------|-------------|\n' +
        '| Off | `off` | Simple factual questions, greetings, formatting tasks |\n' +
        '| Low | `low` | Quick responses, straightforward tasks, casual conversation |\n' +
        '| Medium | `medium` | Balanced reasoning, general problem-solving |\n' +
        '| High | `high` | Complex analysis, coding, mathematical reasoning |\n' +
        '| XHigh | `xhigh` | Deep research, multi-step planning, intricate logic |\n' +
        '| Max | `max` | Maximum reasoning depth, extended thinking for hard problems |\n\n' +
        '## How to Adjust\n\n' +
        'The reasoning effort is set through the model selector in the composer bar (input area):\n\n' +
        '1. Click the model selector button (shows current model name)\n' +
        '2. Select Effort from the dropdown menu\n' +
        '3. Choose the desired level\n\n' +
        'The setting applies to subsequent model calls in the current session.\n\n' +
        '## What the Agent Should Know\n\n' +
        '- Reasoning effort is a user-facing UI control — it is set by the user through the model selector dropdown.\n' +
        '- You cannot directly change the reasoning effort level yourself. Instead, tell the user what level you recommend and ask them to set it.\n' +
        '- If a task requires deeper thinking, suggest: "I recommend switching to High or Max reasoning effort for this task. Click the model selector and choose Effort > High/Max."\n' +
        '- For quick tasks, recommend: "Low or Medium effort works well for this."'
    })
  }

  // Register a system prompt section that tells the agent about reasoning effort
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined) {
    systemPrompt.section({
      name: 'Reasoning Effort',
      order: 150,
      text: '## Reasoning Effort\n\n' +
        'The user can control my thinking depth through the model selector Effort menu in the composer bar.\n' +
        'Available levels: Off / Low / Medium / High / XHigh / Max.\n\n' +
        'If the user asks me to think more deeply or less deeply about a problem, I should tell them to ' +
        'adjust the Effort setting in the model selector. I cannot change it myself.'
    })
  }

  // Agent/request waterfall: safety net for unsupported reasoning efforts.
  // If the model no longer supports the requested effort (e.g. after uninstall),
  // remove it from the config to prevent resolveCallConfig from throwing.
  ctx.on('agent/request', async (payload, next) => {
    const config = await next()
    if (config.reasoningEffort === undefined) return config
    // Check if the model actually supports reasoning
    try {
      const llm = ctx.get('llm')
      if (llm !== undefined) {
        const info = await llm.resolveModelInfo(config.provider, config.model, payload.signal)
        if (info && info.reasoning === undefined) {
          // Model doesn't support reasoning — remove the effort
          const clean = Object.assign({}, config)
          delete clean.reasoningEffort
          return clean
        }
      }
    } catch (_) { /* ignore — let the original config through */ }
    return config
  })
}

module.exports = { name, apply }