return {
  apply(ctx) {
    // Register reasoning-effort skill with comprehensive agent instructions
    const skills = ctx.get('skills')
    if (skills !== undefined) {
      skills.register({
        name: 'reasoning-effort',
        description: 'Control reasoning effort (thinking depth) for model calls. Allows setting low/medium/high/xhigh/max levels.',
        whenToUse: 'Use when the user asks to adjust thinking depth, or when you need to reason at a specific depth for a task.',
        content: `# Reasoning Effort Control

## Overview

Reasoning effort controls how deeply the model thinks before responding. Different tasks benefit from different levels of reasoning depth.

## Available Levels

| Level | Value | When to use |
|-------|-------|-------------|
| Off | \`off\` | Simple factual questions, greetings, formatting tasks |
| Low | \`low\` | Quick responses, straightforward tasks, casual conversation |
| Medium | \`medium\` | Balanced reasoning, general problem-solving |
| High | \`high\` | Complex analysis, coding, mathematical reasoning |
| XHigh | \`xhigh\` | Deep research, multi-step planning, intricate logic |
| Max | \`max\` | Maximum reasoning depth, extended thinking for hard problems |

## How to Adjust

The reasoning effort is set through the **model selector** in the composer bar (input area):

1. Click the model selector button (shows current model name)
2. Select **Effort** from the dropdown menu
3. Choose the desired level

The setting applies to subsequent model calls in the current session.

## What the Agent Should Know

- Reasoning effort is a **user-facing UI control** — it is set by the user through the model selector dropdown.
- You cannot directly change the reasoning effort level yourself. Instead, **tell the user** what level you recommend and ask them to set it.
- If a task requires deeper thinking, suggest: *"I recommend switching to High or Max reasoning effort for this task. Click the model selector and choose Effort > High/Max."*
- For quick tasks, recommend: *"Low or Medium effort works well for this."`
      })
    }

    // Register a system prompt section that tells the agent about reasoning effort
    const systemPrompt = ctx.get('systemPrompt')
    if (systemPrompt !== undefined) {
      systemPrompt.section({
        name: 'Reasoning Effort',
        order: 150,
        text: `## Reasoning Effort

The user can control my thinking depth through the model selector's Effort menu in the composer bar.
Available levels: Off / Low / Medium / High / XHigh / Max.

If the user asks me to think more deeply or less deeply about a problem, I should tell them to
adjust the Effort setting in the model selector. I cannot change it myself.`,
      })
    }

    // Fallback: inject reasoningEffort via agent/request waterfall
    // (the official model selector already handles this when reasoningEfforts are declared in settings.yaml)
    ctx.on('agent/request', async (payload, next) => {
      const config = await next()
      return config
    })
  },
}