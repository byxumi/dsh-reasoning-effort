'use strict'

const name = 'reasoning-effort'
const { applyPiAiPatch, isPiAiPatched } = require('./patch')

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