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

const PI_AI_REL = path.join('@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')

function piAiCandidate(pkgRoot) {
  return path.join(pkgRoot, PI_AI_REL)
}

// pnpm virtual store layout:
//   <root>/node_modules/.pnpm/@deepseek-ai+dsh-llm-pi-ai@<version>/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js
const PNPM_VSTORE_PATTERNS = [
  (base) => path.join(base, 'node_modules', '.pnpm', '@deepseek-ai+dsh-llm-pi-ai@latest', 'node_modules', PI_AI_REL),
]

// Find the pi-ai package inside a pnpm virtual store root.
// pnpm keeps every dependency under node_modules/.pnpm/<scope>+<name>@<semver>/node_modules/
function findInPnpmStore(root) {
  const nm = path.join(root, 'node_modules')
  const pnpmDir = path.join(nm, '.pnpm')
  if (!fs.existsSync(pnpmDir)) return null
  try {
    const dirs = fs.readdirSync(pnpmDir, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      if (!d.name.startsWith('@deepseek-ai+dsh-llm-pi-ai@')) continue
      const candidate = path.join(pnpmDir, d.name, 'node_modules', PI_AI_REL)
      if (fs.existsSync(candidate)) return candidate
    }
  } catch (_) { /* ignore */ }
  return null
}

// DFS scan for the pi-ai package inside a cache root.
// Checks <dir>/@deepseek-ai/... and <dir>/node_modules/@deepseek-ai/... at each level.
function scanForPiAi(root, depth, maxDepth) {
  if (depth > maxDepth) return null
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const p = path.join(root, e.name)
      // pnpm virtual store inside a node_modules
      if (e.name === 'node_modules') {
        const direct = piAiCandidate(p)
        if (fs.existsSync(direct)) return direct
        const pnpm = findInPnpmStore(p)
        if (pnpm) return pnpm
        const found = scanForPiAi(p, depth + 1, maxDepth + 1)
        if (found) return found
        continue
      }
      // direct @deepseek-ai check inside every folder
      const direct = piAiCandidate(p)
      if (fs.existsSync(direct)) return direct
      // descend
      const found = scanForPiAi(p, depth + 1, maxDepth)
      if (found) return found
    }
  } catch (_) { /* ignore */ }
  return null
}

function findPiAiIndex(cwd) {
  // 1) search up the directory tree from cwd (project-local installs)
  //    also covers pnpm project stores (node_modules/.pnpm) and npm flat stores
  let dir = path.resolve(cwd)
  for (;;) {
    const c = path.join(dir, 'node_modules', PI_AI_REL)
    if (fs.existsSync(c)) return c
    // pnpm project virtual store
    const pnpmStore = findInPnpmStore(dir)
    if (pnpmStore) return pnpmStore
    const p = path.dirname(dir)
    if (p === dir) break
    dir = p
  }

  // 2) known global / cache roots across platforms
  const home = os.homedir()
  const roots = [
    // Windows npm/npx
    path.join(home, 'AppData', 'Local', 'npm-cache', '_npx'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules'),
    // Windows pnpm
    path.join(home, 'AppData', 'Local', 'pnpm'),
    path.join(home, 'AppData', 'Local', 'pnpm', 'global'),
    path.join(home, 'AppData', 'Local', 'pnpm', 'store'),
    path.join(home, 'AppData', 'Local', 'pnpm', 'global', '5', 'node_modules'),
    path.join(home, 'AppData', 'Roaming', 'pnpm'),
    // macOS / Linux npm
    path.join(home, '.npm', '_npx'),
    path.join(home, '.npm', 'node_modules'),
    path.join('/usr', 'local', 'lib', 'node_modules'),
    // macOS / Linux pnpm
    path.join('/usr', 'local', 'share', 'pnpm'),
    path.join(home, '.local', 'share', 'pnpm'),
    path.join(home, '.local', 'share', 'pnpm', 'global'),
    path.join(home, '.local', 'share', 'pnpm', 'global', '5', 'node_modules'),
    path.join(home, '.pnpm-store'),
    path.join(home, '.pnpm'),
    // macOS / Linux npm (homebrew / system)
    path.join('/opt', 'homebrew', 'lib', 'node_modules'),
    // pnpm mac
    path.join(home, 'Library', 'pnpm'),
    // yarn
    path.join(home, '.config', 'yarn', 'global', 'node_modules'),
    path.join(home, '.yarn'),
    // scoop / chocolatey
    path.join(home, 'scoop', 'apps'),
    path.join('C:', 'ProgramData', 'chocolatey', 'lib'),
  ]

  for (const base of roots) {
    if (!fs.existsSync(base)) continue
    try {
      // direct hit: <base>/@deepseek-ai/dsh-llm-pi-ai/lib/index.js
      const direct = piAiCandidate(base)
      if (fs.existsSync(direct)) return direct
      // pnpm virtual store at this root
      const pnpm = findInPnpmStore(base)
      if (pnpm) return pnpm
      // DFS deep scan: npx hash dirs, pnpm store dirs, scoop apps, etc.
      const found = scanForPiAi(base, 0, 4)
      if (found) return found
    } catch (_) { /* ignore */ }
  }

  // 3) try resolving via npm / node itself
  try {
    const globalRoot = require('child_process').execSync('npm root -g', { encoding: 'utf8', timeout: 15000 }).trim()
    if (globalRoot) {
      const c = piAiCandidate(globalRoot)
      if (fs.existsSync(c)) return c
      const pnpm = findInPnpmStore(globalRoot)
      if (pnpm) return pnpm
    }
  } catch (_) { /* ignore */ }

  // 4) pnpm root -g (global install location)
  try {
    const pnpmRoot = require('child_process').execSync('pnpm root -g', { encoding: 'utf8', timeout: 15000 }).trim()
    if (pnpmRoot) {
      const c = piAiCandidate(pnpmRoot)
      if (fs.existsSync(c)) return c
      const pnpm = findInPnpmStore(pnpmRoot)
      if (pnpm) return pnpm
    }
  } catch (_) { /* ignore */ }

  // 5) locate via `where dsh` / `which dsh` command
  //    Covers ANY installation method where dsh is on PATH
  //    (npm global, pnpm global, yarn, etc.)
  try {
    const isWin = process.platform === 'win32'
    const dshPath = require('child_process').execSync(isWin ? 'where dsh' : 'which dsh', { encoding: 'utf8', timeout: 5000 }).trim().split(/\r?\n/)[0]
    if (dshPath) {
      // Walk up from the dsh command directory looking for node_modules/@deepseek-ai/dsh-llm-pi-ai
      // dshPath examples:
      //   npm global:  C:\Users\<user>\AppData\Roaming\npm\dsh.cmd
      //   npx:         C:\Users\<user>\AppData\Local\npm-cache\_npx\<hash>\node_modules\.bin\dsh
      const dshDir = path.dirname(path.resolve(dshPath))
      let walk = dshDir
      for (let i = 0; i < 6; i++) {
        const nm = path.join(walk, 'node_modules')
        if (fs.existsSync(nm)) {
          const c = piAiCandidate(nm)
          if (fs.existsSync(c)) return c
          const pnpm = findInPnpmStore(nm)
          if (pnpm) return pnpm
        }
        const parent = path.dirname(walk)
        if (parent === walk) break
        walk = parent
      }
    }
  } catch (_) { /* ignore */ }

  // 6) try npm config get cache to find the npm/npx cache directory
  try {
    const cachePath = require('child_process').execSync('npm config get cache', { encoding: 'utf8', timeout: 10000 }).trim()
    if (cachePath) {
      const npxDir = path.join(cachePath, '_npx')
      if (fs.existsSync(npxDir)) {
        const found = scanForPiAi(npxDir, 0, 4)
        if (found) return found
      }
    }
  } catch (_) { /* ignore */ }

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
    warn('@deepseek-ai/dsh-llm-pi-ai not found.')
    warn('')
    warn('This tool patches the pi-ai adapter bundled with DSH (DeepSeek Harness).')
    warn('If DSH is not installed yet, first install and run it once:')
    warn('    npm install -g @deepseek-ai/dsh')
    warn('    dsh --version')
    warn('')
    warn('If DSH is installed but the package is in a custom location, point to it:')
    warn('    node install.js --pi-ai "C:/path/to/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js"')
    warn('')
    warn('To find the file yourself, look for:')
    warn('    node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js')
    warn('    (inside your DSH installation or the npx cache under ~/AppData/Local/npm-cache/_npx)')
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