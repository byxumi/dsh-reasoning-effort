#!/usr/bin/env node
/**
 * DSH Reasoning Effort Setup for Windows
 * ========================================
 * One-click installer that enables reasoning effort selection in the official
 * DSH model selector. Works with any provider and any model.
 *
 * What it does:
 *  1. Patches @deepseek-ai/dsh-llm-pi-ai to forward compat fields
 *     (fixes 400 errors from developer role / store / max_completion_tokens)
 *  2. Optionally writes reasoning effort declarations into settings.yaml
 *     (only when --provider / --models are explicitly given)
 *
 * Works on: Windows, macOS, Linux
 */

'use strict'

// ---------------------------------------------------------------------------
// Console encoding fix for Windows (prevents garbled Chinese output)
// ---------------------------------------------------------------------------
if (process.platform === 'win32' && process.stdout?.isTTY) {
  try {
    const cp = require('child_process')
    cp.execSync('chcp 65001 >NUL', { stdio: 'ignore', timeout: 1000 })
  } catch (_) { /* ignore */ }
}

const fs = require('fs')
const path = require('path')
const os = require('os')

// ===========================================================================
//  Constants
// ===========================================================================

const PKG = 'dsh-win-reasoning'
const VERSION = '1.0.0'

const PATCH_MARKER = 'supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole }'

const ORIGINAL_HEAD = 'const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;\n' +
  '\tconst supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;\n' +
  '\tif (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};'

const PATCHED_HEAD = 'const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;\n' +
  '\tconst supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;\n' +
  '\tconst supportsDeveloperRole = entry.compat?.supportsDeveloperRole ?? route?.supportsDeveloperRole;\n' +
  '\tconst supportsStore = entry.compat?.supportsStore ?? route?.supportsStore;\n' +
  '\tconst maxTokensField = entry.compat?.maxTokensField ?? route?.maxTokensField;\n' +
  '\tif (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};'

const ORIGINAL_FN_TAIL = 'supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort }\n\t}; };'

const PATCHED_FN_TAIL = 'supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort },\n' +
  '\t\t...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole },\n' +
  '\t\t...supportsStore === void 0 ? {} : { supportsStore },\n' +
  '\t\t...maxTokensField === void 0 ? {} : { maxTokensField }\n\t}; };'

// Fallback: also try the exact original function ending
const ORIGINAL_FN_TAIL_V2 = 'supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort }\n\t} };'
const PATCHED_FN_TAIL_V2 = 'supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort },\n' +
  '\t\t...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole },\n' +
  '\t\t...supportsStore === void 0 ? {} : { supportsStore },\n' +
  '\t\t...maxTokensField === void 0 ? {} : { maxTokensField }\n\t} };'

// ===========================================================================
//  Helpers
// ===========================================================================

const indentOf = (line) => { const m = line.match(/^\s*/); return m ? m[0].length : 0 }
const log = (msg) => console.log(msg)
const warn = (msg) => console.error('! ' + msg)
const die = (msg) => { warn(msg); process.exit(1) }

// ===========================================================================
//  CLI
// ===========================================================================

function parseArgs(argv) {
  const args = { piAi: null, settings: null, provider: null, models: null, off: false, list: false, dryRun: false, version: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pi-ai') args.piAi = argv[++i]
    else if (a === '--settings') args.settings = argv[++i]
    else if (a === '--provider') args.provider = argv[++i]
    else if (a === '--models') args.models = argv[++i]
    else if (a === '--off') args.off = true
    else if (a === '--list' || a === '-l') args.list = true
    else if (a === '--dry-run' || a === '-n') args.dryRun = true
    else if (a === '--version' || a === '-v') args.version = true
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
  }
  return args
}

function printHelp() {
  log(`
${PKG} v${VERSION} — DSH reasoning effort installer

USAGE:
  node install.js [options]

OPTIONS:
  --provider <name>    Provider name to configure (e.g. my-gateway, openai)
  --models <list>      Comma-separated model IDs (e.g. model-a,model-b)
  --pi-ai <path>       Path to dsh-llm-pi-ai/lib/index.js (auto-detected)
  --settings <path>    Path to settings.yaml (default: ~/.dsh/settings.yaml)
  --off                Only patch pi-ai, skip settings.yaml changes
  --list, -l           List currently configured providers and models
  --dry-run, -n        Preview changes without writing files
  --version, -v        Show version
  --help, -h           Show this help

EXAMPLES:
  node install.js                              # Patch + print template
  node install.js --off                        # Only patch, no config changes
  node install.js --provider mygw --models m1,m2
  node install.js --list                       # Inspect current config
  node install.js --dry-run --provider mygw --models m1,m2
`)
}

// ===========================================================================
//  Pi-ai adapter locator
// ===========================================================================

function findPiAiIndex(cwd) {
  let dir = path.resolve(cwd)
  for (;;) {
    const c = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')
    if (fs.existsSync(c)) return c
    const p = path.dirname(dir)
    if (p === dir) break
    dir = p
  }
  for (const base of [
    path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx'),
    path.join(os.homedir(), '.npm', '_npx'),
    path.join(os.homedir(), '.local', 'share', 'pnpm'),
  ]) {
    if (!fs.existsSync(base)) continue
    try {
      const entries = fs.readdirSync(base)
      for (const e of entries) {
        const c = path.join(base, e, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')
        if (fs.existsSync(c)) return c
      }
    } catch (_) { /* ignore */ }
  }
  return null
}

// ===========================================================================
//  Pi-ai compat patch
// ===========================================================================

function applyPiAiPatch(indexPath, dryRun) {
  const src = fs.readFileSync(indexPath, 'utf8')
  if (src.includes(PATCH_MARKER)) return { status: 'already' }

  if (!src.includes(ORIGINAL_HEAD)) {
    throw new Error(
      `Cannot find expected code block in ${indexPath}.\n` +
      'This version of dsh-llm-pi-ai may already have this fix, or its code structure has changed.\n' +
      'Check the resolveModelCompat function manually, or use --pi-ai to point to the correct path.'
    )
  }

  const bak = dryRun ? null : (indexPath + '.dsh-reasoning.bak')
  let patched = src.replace(ORIGINAL_HEAD, PATCHED_HEAD)
  patched = patched.replace(ORIGINAL_FN_TAIL_V2, PATCHED_FN_TAIL_V2)

  if (dryRun) {
    const diff = patched !== src
    return { status: 'would-patch', wouldChange: diff }
  }

  fs.writeFileSync(bak, src, 'utf8')
  fs.writeFileSync(indexPath, patched, 'utf8')
  return { status: 'patched', backup: bak }
}

// ===========================================================================
//  Settings.yaml parser & writer
// ===========================================================================

function defaultSettingsPath() {
  return path.join(os.homedir(), '.dsh', 'settings.yaml')
}

function modelBlock(id, name, indent) {
  const c = `  compat:\n${indent}    supportsReasoningEffort: true\n${indent}    supportsDeveloperRole: false\n${indent}    supportsStore: false\n${indent}    maxTokensField: max_tokens`
  const e = `  reasoningEfforts:\n${indent}    off: null\n${indent}    low: low\n${indent}    medium: medium\n${indent}    high: high\n${indent}    xhigh: xhigh\n${indent}    max: max`
  return `${indent}- id: ${id}\n${indent}  name: ${name}\n${indent}  contextWindow: 1000000\n${indent}  maxTokens: 65536\n${indent}${c}\n${indent}${e}`
}

function parsePiAiSections(text) {
  const lines = text.split(/\r?\n/)
  const sections = []
  let inPiAi = false, inProviders = false, current = null, inModels = false
  for (let i = 0; i < lines.length; i++) {
    const ind = indentOf(lines[i])
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (!inPiAi) { if (/^llm-pi-ai\s*:/.test(trimmed)) inPiAi = true; continue }
    if (!inProviders) { if (/^providers\s*:/.test(trimmed)) { inProviders = true; continue } continue }
    if (ind === 4 && /^[A-Za-z0-9_-]+\s*:$/.test(trimmed) && !trimmed.startsWith('-')) {
      if (current) finalizeSection(current, lines, i)
      current = { provider: trimmed.replace(/:$/, ''), modelsStart: -1, modelsEnd: -1, models: [] }
      sections.push(current); inModels = false; continue
    }
    if (current && ind === 6 && /^models\s*:/.test(trimmed)) { inModels = true; if (current.modelsStart < 0) current.modelsStart = i; continue }
    if (current && inModels && /^- id:\s+(\S+)/.test(trimmed)) { current.models.push({ index: i, modelId: trimmed.match(/^- id:\s+(\S+)/)[1] }); continue }
    if (ind === 0 && /^[A-Za-z0-9_-]+\s*\S*:/.test(trimmed) && !/^llm-pi-ai/.test(trimmed)) {
      if (current) finalizeSection(current, lines, i)
      inPiAi = false; inProviders = false; current = null; inModels = false; continue
    }
  }
  if (current) finalizeSection(current, lines, lines.length)
  return sections
}

function finalizeSection(sec, lines, endIndex) {
  if (sec.models.length === 0) { sec.modelsEnd = sec.modelsStart >= 0 ? sec.modelsStart : -1; return }
  const last = sec.models[sec.models.length - 1]
  let end = last.index
  for (let j = last.index + 1; j < lines.length && j < endIndex; j++) {
    const ind = indentOf(lines[j]), trimmed = lines[j].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (ind <= 6) break
    end = j
  }
  sec.modelsEnd = end
}

function modelHasReasoningEfforts(text, provider, modelId) {
  const lines = text.split(/\r?\n/)
  for (const sec of parsePiAiSections(text)) {
    if (sec.provider !== provider) continue
    for (const m of sec.models) {
      if (m.modelId !== modelId) continue
      for (let j = m.index + 1; j <= sec.modelsEnd; j++) {
        const ind = indentOf(lines[j]), trimmed = lines[j].trim()
        if (ind <= 8 && /^- id:/.test(trimmed)) break
        if (/^reasoningEfforts\s*:/.test(trimmed)) return true
      }
      return false
    }
  }
  return false
}

function mergeSettings(settingsPath, provider, models, dryRun) {
  let text = ''
  if (fs.existsSync(settingsPath)) text = fs.readFileSync(settingsPath, 'utf8')
  else fs.mkdirSync(path.dirname(settingsPath), { recursive: true })

  let needWrite = false, sections = parsePiAiSections(text)
  const providerSection = sections.find(s => s.provider === provider)

  if (providerSection && providerSection.modelsEnd >= 0) {
    for (const m of models) {
      if (modelHasReasoningEfforts(text, provider, m)) continue
      const block = modelBlock(m, m, '        ')
      const ln = text.split(/\r?\n/); ln.splice(providerSection.modelsEnd + 1, 0, block)
      text = ln.join('\n'); needWrite = true
      sections = parsePiAiSections(text)
      const ns = sections.find(s => s.provider === provider)
      if (ns) providerSection.modelsEnd = ns.modelsEnd
    }
  } else if (providerSection) {
    const ln = text.split(/\r?\n/); const pIdx = ln.findIndex(l => indentOf(l) === 4 && l.trim().replace(/:$/, '') === provider)
    if (pIdx >= 0) {
      const insert = ['      models:']
      for (const m of models) { if (!modelHasReasoningEfforts(text, provider, m)) { insert.push(modelBlock(m, m, '        ')); needWrite = true } }
      if (needWrite) { ln.splice(pIdx + 1, 0, ...insert); text = ln.join('\n') }
    }
  } else {
    const missing = models.filter(m => !modelHasReasoningEfforts(text, provider, m))
    if (missing.length) {
      text = text.replace(/\s*$/, '') + '\n\nllm-pi-ai:\n  providers:\n    ' + provider + ':\n      api: openai-completions\n      models:\n'
      for (const m of missing) text += modelBlock(m, m, '        ') + '\n'
      needWrite = true
    }
  }

  if (needWrite && !dryRun) fs.writeFileSync(settingsPath, text, 'utf8')
  return { status: needWrite ? (dryRun ? 'would-merge' : 'merged') : 'already', dryRun }
}

// ===========================================================================
//  Print template
// ===========================================================================

function printTemplate() {
  log(`
--- Generic settings.yaml template ---
Copy the block below into ~/.dsh/settings.yaml under llm-pi-ai.providers:

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

Note: Only list levels your model actually supports.
  DeepSeek: high/max | OpenAI: low/medium/high | others: check your gateway.
---`)
}

// ===========================================================================
//  List command
// ===========================================================================

function cmdList(settingsPath) {
  if (!fs.existsSync(settingsPath)) { warn('settings.yaml not found at ' + settingsPath); return }
  const text = fs.readFileSync(settingsPath, 'utf8')
  const sections = parsePiAiSections(text)
  if (sections.length === 0) { log('No llm-pi-ai configuration found in settings.yaml.'); return }
  log('Configured providers & models:')
  for (const sec of sections) {
    log(`\n  ${sec.provider}:`)
    for (const m of sec.models) {
      const hasEffort = modelHasReasoningEfforts(text, sec.provider, m.modelId)
      log(`    - ${m.modelId}  ${hasEffort ? '(reasoningEfforts: yes)' : ''}`)
    }
    if (sec.models.length === 0) log('    (no models listed)')
  }
}

// ===========================================================================
//  Main
// ===========================================================================

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()

  if (args.version) { log(`${PKG} v${VERSION}`); process.exit(0) }

  // --- Step 1: pi-ai patch ---
  let piAiIndex = args.piAi || findPiAiIndex(cwd)
  if (!piAiIndex) {
    warn('@deepseek-ai/dsh-llm-pi-ai not found. Use --pi-ai to specify the path.')
    warn('Expected: <dsh>/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js')
    process.exit(1)
  }
  log(`[1/2] pi-ai adapter: ${piAiIndex}`)
  try {
    const r = applyPiAiPatch(piAiIndex, args.dryRun)
    if (r.status === 'already') log('  ✓ patch already applied, skipping')
    else if (r.status === 'would-patch') log('  ✓ would patch (dry-run)')
    else log('  ✓ patched (backup: ' + r.backup + ')')
  } catch (e) { die(e.message) }

  // --- List mode ---
  if (args.list) {
    log('\n[--list] Current settings:')
    cmdList(args.settings || defaultSettingsPath())
    return
  }

  // --- Off mode ---
  if (args.off) {
    log('\n[2/2] --off mode: no configuration files changed')
    log('\nDone. pi-ai patch applied. Restart DSH to take effect.')
    return
  }

  // --- Step 2: settings merge ---
  const settingsPath = args.settings || defaultSettingsPath()
  log(`[2/2] settings: ${settingsPath}`)

  const provider = args.provider
  const models = args.models ? args.models.split(',').map(s => s.trim()).filter(Boolean) : []

  if (provider && models.length > 0) {
    try {
      const r = mergeSettings(settingsPath, provider, models, args.dryRun)
      const statusMap = { already: '✓ already declared, skipping', merged: '✓ updated', 'would-merge': '✓ would update (dry-run)' }
      log('  ' + (statusMap[r.status] || r.status))
    } catch (e) { die(e.message) }

    // Verify
    if (!args.dryRun) {
      const finalSettings = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : ''
      const piAiSrc = fs.readFileSync(piAiIndex, 'utf8')
      const okPatch = piAiSrc.includes(PATCH_MARKER)
      const okSettings = /reasoningEfforts\s*:/.test(finalSettings)
      if (okPatch && okSettings) log('\nDone. Restart DSH to use.')
      else {
        warn('\nPartial check:')
        if (!okPatch) warn('  - pi-ai patch not found')
        if (!okSettings) warn('  - settings.yaml missing reasoningEfforts declarations')
      }
    }
  } else {
    log('  No --provider / --models given. Skipping automatic settings write.')
    printTemplate()
    log('\nTo write config automatically:')
    log('  node install.js --provider <name> --models <model1,model2>')
    log('To preview changes:')
    log('  node install.js --dry-run --provider <name> --models <model1,model2>')
  }
}

main()