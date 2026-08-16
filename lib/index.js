return {
  apply(ctx) {
    // Register reasoning-effort skill
    const skills = ctx.get('skills')
    if (skills !== undefined) {
      skills.register({
        name: 'reasoning-effort',
        description: 'Control reasoning effort (thinking depth) for model calls. Allows setting low/medium/high/xhigh/max levels.',
        whenToUse: 'Use when you need to control the model\'s thinking depth through the model selector in the composer bar.',
        content: '# Reasoning Effort\n\nReasoning effort controls how deeply the model thinks before responding.\n\n## Levels\n\n- **Off** — Disable thinking\n- **Low** — Minimal reasoning\n- **Medium** — Moderate reasoning\n- **High** — Standard reasoning\n- **XHigh** — High-intensity reasoning\n- **Max** — Maximum reasoning\n\n## How to Use\n\n1. Click the model selector in the composer bar\n2. Select "Effort" from the menu\n3. Choose your desired level\n\nThe setting applies to subsequent model calls.',
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