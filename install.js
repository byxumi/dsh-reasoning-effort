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
  const pnpmDir = path.join(root, 'node_modules', '.pnpm')
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

// Find ALL pi-ai package locations. Returns array of index.js paths (deduplicated).
// Covers: npm global (nested inside dsh), npx cache, desktop Electron runtime,
// project-local, pnpm stores, and `where dsh` resolution.
function findAllPiAiLocations(cwd) {
  const found = new Map() // path -> true, to dedupe

  function add(p) {
    if (p && fs.existsSync(p)) {
      const norm = path.resolve(p)
      if (!found.has(norm)) found.set(norm, true)
    }
  }

  // 1) search up the directory tree (project-local installs)
  let dir = path.resolve(cwd)
  for (;;) {
    add(path.join(dir, 'node_modules', PI_AI_REL))
    add(findInPnpmStore(dir))
    const p = path.dirname(dir)
    if (p === dir) break
    dir = p
  }

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
    // Desktop Electron apps: <dir>/resources/runtime/node_modules
    ...desktopRuntimeRoots(),
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
    path.join('/opt', 'homebrew', 'lib', 'node_modules'),
    path.join(home, 'Library', 'pnpm'),
    path.join(home, '.config', 'yarn', 'global', 'node_modules'),
    path.join(home, '.yarn'),
    path.join(home, 'scoop', 'apps'),
    path.join('C:', 'ProgramData', 'chocolatey', 'lib'),
  ]
  // Add the npm global node_modules path wherever npm thinks it is
  try {
    const g = require('child_process').execSync('npm root -g', { encoding: 'utf8', timeout: 10000 }).trim()
    if (g) roots.push(g)
  } catch (_) { /* ignore */ }

  for (const base of roots) {
    if (!base || !fs.existsSync(base)) continue
    try {
      add(piAiCandidate(base))
      add(findInPnpmStore(base))
      // DFS scan to find ALL nested copies, not just the first
      collectScan(base, add, 0, 4)
    } catch (_) { /* ignore */ }
  }

  // 2) locate via `where dsh` / `which dsh` — resolves the ACTUAL installed dsh
  try {
    const isWin = process.platform === 'win32'
    const outs = require('child_process').execSync(isWin ? 'where dsh' : 'which dsh', { encoding: 'utf8', timeout: 5000 })
    const dshPaths = outs.split(/\r?\n/).filter(s => s.trim())
    for (const dshPath of dshPaths.slice(0, 3)) {
      if (!dshPath) continue
      // Resolve real path of the .cmd / shim
      let real = dshPath
      try { real = fs.realpathSync(dshPath) } catch (_) { /* keep original */ }
      const dshDir = path.dirname(path.resolve(real))
      // Walk up looking for node_modules/@deepseek-ai/... and nested dsh/node_modules
      let walk = dshDir
      for (let i = 0; i < 8; i++) {
        const nm = path.join(walk, 'node_modules')
        if (fs.existsSync(nm)) {
          add(piAiCandidate(nm))
          add(findInPnpmStore(nm))
          // npm global nested layout: <nm>/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai
          const dshPkg = path.join(nm, '@deepseek-ai', 'dsh')
          if (fs.existsSync(dshPkg)) {
            add(piAiCandidate(path.join(dshPkg, 'node_modules')))
          }
        }
        const parent = path.dirname(walk)
        if (parent === walk) break
        walk = parent
      }
      // Also the dsh package's own nested node_modules (npm nested deps)
      add(piAiCandidate(path.join(dshDir, 'node_modules')))
    }
  } catch (_) { /* ignore */ }

  // 3) pnpm root -g
  try {
    const pr = require('child_process').execSync('pnpm root -g', { encoding: 'utf8', timeout: 10000 }).trim()
    if (pr) { add(piAiCandidate(pr)); add(findInPnpmStore(pr)) }
  } catch (_) { /* ignore */ }

  // 4) require.resolve fallback
  try {
    const r = require.resolve('@deepseek-ai/dsh-llm-pi-ai/lib/index')
    if (r) add(r)
  } catch (_) { /* ignore */ }

  return Array.from(found.keys())
}

// Heuristic: locate Electron/desktop app runtimes on the system
// (e.g. D:\deepseek harness\resources\runtime\node_modules)
function desktopRuntimeRoots() {
  const roots = []
  const home = os.homedir()
  const candidates = []
  // Common desktop app install dirs
  for (const d of ['D:', 'C:', 'E:', 'F:']) {
    if (fs.existsSync(d + path.sep)) candidates.push(d + path.sep)
  }
  for (const base of candidates) {
    try {
      const top = fs.readdirSync(base, { withFileTypes: true })
      for (const e of top) {
        if (!e.isDirectory()) continue
        const rt = path.join(base, e.name, 'resources', 'runtime', 'node_modules')
        if (fs.existsSync(rt)) roots.push(rt)
        else if (fs.existsSync(path.join(base, e.name, 'resources', 'app', 'node_modules'))) {
          roots.push(path.join(base, e.name, 'resources', 'app', 'node_modules'))
        }
      }
    } catch (_) { /* ignore */ }
  }
  return roots
}

// Collect every matching index.js under `root` into `add` (no early return)
function collectScan(root, add, depth, maxDepth) {
  if (depth > maxDepth) return
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const p = path.join(root, e.name)
      if (e.name === 'node_modules') {
        add(piAiCandidate(p))
        add(findInPnpmStore(p))
        collectScan(p, add, depth + 1, maxDepth + 1)
        continue
      }
      add(piAiCandidate(p))
      collectScan(p, add, depth + 1, maxDepth)
    }
  } catch (_) { /* ignore */ }
}

// Recursive search for the pi-ai package by directory name.
// Walks all directories under `root` looking for a folder named `dsh-llm-pi-ai`
// with a `lib/index.js` inside. Capped at `maxScanned` entries to avoid
// hanging on content-addressed stores (pnpm store, git, etc.).
// Depth is limited to 15 to avoid scanning the entire filesystem.
function findPiAiByPackageName(root, maxScanned, depth) {
  if (maxScanned === undefined) maxScanned = 50000
  if (depth === undefined) depth = 0
  if (depth > 15) return null
  let limit = maxScanned
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (limit-- <= 0) return null
      const p = path.join(root, e.name)
      // Skip pnpm content-addressed store, git, etc.
      if ((e.name === 'files' || e.name === 'store') && p.includes('pnpm' + path.sep + 'store')) continue
      if (e.name === '.git' || e.name === 'node_modules' && depth === 0) continue
      if (e.name === 'dsh-llm-pi-ai') {
        const candidate = path.join(p, 'lib', 'index.js')
        if (fs.existsSync(candidate)) return candidate
        continue
      }
      const found = findPiAiByPackageName(p, limit, depth + 1)
      if (found) return found
    }
  } catch (_) { /* ignore */ }
  return null
}

// Try to locate the pi-ai package by reading the pnpm global bin shim.
// pnpm's global bin shim (e.g. %LOCALAPPDATA%\pnpm\bin\dsh.cmd) contains
// a reference to the actual DSH package path. We parse it and walk up.
function findPiAiViaPnpmShim(home) {
  const binDirs = [
    path.join(home, 'AppData', 'Local', 'pnpm', 'bin'),
    path.join(home, '.local', 'share', 'pnpm', 'bin'),
    path.join('/usr', 'local', 'share', 'pnpm', 'bin'),
  ]
  for (const binDir of binDirs) {
    if (!fs.existsSync(binDir)) continue
    // Look for the dsh shim (dsh.cmd on Windows, dsh on Unix)
    const shimName = process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
    const shimPath = path.join(binDir, shimName)
    if (!fs.existsSync(shimPath)) continue
    try {
      const content = fs.readFileSync(shimPath, 'utf8')
      // The shim usually contains a path like "node_modules\@deepseek-ai\dsh\..."
      // or references the global directory. Try to extract a path.
      const match = content.match(/["']([^"']*node_modules[^"']*dsh[^"']*?)["']/i)
      if (match) {
        const refPath = path.resolve(binDir, match[1])
        // Walk up from the dsh package to find pi-ai
        let walk = path.dirname(refPath)
        for (let i = 0; i < 4; i++) {
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
      // Also try pi-ai candidate relative to the bin dir
      const candidate = piAiCandidate(path.join(path.dirname(binDir), 'global', '5', 'node_modules'))
      if (fs.existsSync(candidate)) return candidate
    } catch (_) { /* ignore */ }
  }
  return null
}

function findPiAiIndex(cwd) {
  const all = findAllPiAiLocations(cwd)
  return all.length > 0 ? all[0] : null
}

// ===========================================================================
//  Pi-ai compat patch
// ===========================================================================

function applyPiAiPatch(indexPath, dryRun) {
  let src = fs.readFileSync(indexPath, 'utf8')
  const lines = src.split('\n')

  // Check if fully patched: look for the patch-specific return spread lines
  const isFullyPatched = lines.some(l => l.includes('...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole }'))
  if (isFullyPatched) return { status: 'already' }

  // Find the resolveModelCompat function
  const fnIdx = lines.findIndex(l => l.includes('function resolveModelCompat'))
  if (fnIdx < 0) {
    throw new Error(`Cannot find resolveModelCompat in ${indexPath}.`)
  }

  // --- Patch head: add variable declarations and extend the if condition ---
  // IMPORTANT: preserve ALL lines before the function — only the function body
  // is modified. Copy lines[0..fnIdx-1] verbatim first.
  const headLines = lines.slice(0, fnIdx)
  let insertedHead = false
  for (let i = fnIdx; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    // Insert the 3 declarations after the supportsReasoningEffort declaration
    // (idempotent: skip if the next line is already a patched declaration)
    if (!insertedHead && trimmed.startsWith('const supportsReasoningEffort =')) {
      headLines.push(line)
      const indent = line.match(/^\s*/)[0]
      const nextLine = (lines[i + 1] || '').trim()
      if (!nextLine.startsWith('const supportsDeveloperRole =')) {
        headLines.push(indent + 'const supportsDeveloperRole = entry.compat?.supportsDeveloperRole ?? route?.supportsDeveloperRole;')
        headLines.push(indent + 'const supportsStore = entry.compat?.supportsStore ?? route?.supportsStore;')
        headLines.push(indent + 'const maxTokensField = entry.compat?.maxTokensField ?? route?.maxTokensField;')
      }
      insertedHead = true
      continue
    }
    // Extend the if condition (skip if already extended)
    if (trimmed.startsWith('if (thinkingFormat === void 0 && supportsReasoningEffort === void 0') && !trimmed.includes('supportsDeveloperRole')) {
      headLines.push(line.replace(
        'if (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};',
        'if (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};'
      ))
      continue
    }
    headLines.push(line)
  }

  // --- Patch tail: add the 3 spread lines inside the return { compat: { ... } } ---
  const out = []
  let inCompat = false
  let insertedTail = false
  for (let i = 0; i < headLines.length; i++) {
    const line = headLines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('return { compat: {')) {
      inCompat = true
      out.push(line)
      continue
    }
    if (inCompat) {
      // When we reach the supportsReasoningEffort spread, insert the 3 new spreads
      // (idempotent: skip insertion if the next line is already supportsDeveloperRole)
      if (!insertedTail && trimmed.includes('...supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort }')) {
        const indent = line.match(/^\s*/)[0]
        const nextLine = (headLines[i + 1] || '').trim()
        out.push(line)
        if (!nextLine.includes('...supportsDeveloperRole')) {
          out.push(indent + '...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole },')
          out.push(indent + '...supportsStore === void 0 ? {} : { supportsStore },')
          out.push(indent + '...maxTokensField === void 0 ? {} : { maxTokensField }')
        }
        insertedTail = true
        continue
      }
      // Skip already-present patched spread lines (after insertion point)
      if (trimmed.includes('...supportsDeveloperRole') || trimmed.includes('...supportsStore') || trimmed.includes('...maxTokensField')) {
        if (insertedTail) continue
      }
      // Exit the return block
      if (trimmed === '} };' || trimmed === '};' || trimmed === '}' || trimmed === '}') {
        inCompat = false
        out.push(line)
        continue
      }
      out.push(line)
      continue
    }
    out.push(line)
  }

  const patched = out.join('\n')
  if (patched === src) {
    throw new Error(`Patch produced no changes in ${indexPath}. This version may already be patched.`)
  }

  if (dryRun) return { status: 'would-patch', wouldChange: true }

  const bak = indexPath + '.dsh-reasoning.bak'
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

// Only the declaration sub-blocks (compat + reasoningEfforts), without the model header.
// Used when adding declarations to an EXISTING model that already has its - id: line.
// modelIndent is the indent of the `- id:` line (e.g. 8 spaces).
// The `compat:` and `reasoningEfforts:` keys should be at modelIndent + 2.
function declarationBlock(modelIndent) {
  const outer = modelIndent + '  '  // e.g. 10 spaces
  const inner = modelIndent + '    '  // e.g. 12 spaces
  return outer + 'compat:\n' +
    inner + 'supportsReasoningEffort: true\n' +
    inner + 'supportsDeveloperRole: false\n' +
    inner + 'supportsStore: false\n' +
    inner + 'maxTokensField: max_tokens\n' +
    outer + 'reasoningEfforts:\n' +
    inner + 'off: null\n' +
    inner + 'low: low\n' +
    inner + 'medium: medium\n' +
    inner + 'high: high\n' +
    inner + 'xhigh: xhigh\n' +
    inner + 'max: max'
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
    if (current && inModels && ind >= 8 && /^- id:\s+(\S+)/.test(trimmed)) {
      current.models.push({ start: i, end: -1, modelId: trimmed.match(/^- id:\s+(\S+)/)[1] })
      continue
    }
    if (ind === 0 && /^[A-Za-z0-9_-]+\s*\S*:/.test(trimmed) && !/^llm-pi-ai/.test(trimmed)) {
      if (current) finalizeSection(current, lines, i)
      inPiAi = false; inProviders = false; current = null; inModels = false; continue
    }
  }
  if (current) finalizeSection(current, lines, lines.length)
  return sections
}

// 计算每个模型的结束行（下一个模型行的前一行为当前模型末尾）
function finalizeModelEnds(sec) {
  for (let i = 0; i < sec.models.length; i++) {
    const m = sec.models[i]
    const next = sec.models[i + 1]
    m.end = next ? next.start - 1 : sec.modelsEnd
  }
}

function finalizeSection(sec, lines, endIndex) {
  // 计算 section 的 modelsEnd（最后一个模型块的末尾）
  if (sec.models.length === 0) {
    sec.modelsEnd = sec.modelsStart >= 0 ? sec.modelsStart : -1
    return
  }
  const last = sec.models[sec.models.length - 1]
  let end = last.start
  for (let j = last.start + 1; j < lines.length && j < endIndex; j++) {
    const ind = indentOf(lines[j]), trimmed = lines[j].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (ind <= 6) break
    end = j
  }
  sec.modelsEnd = end
  finalizeModelEnds(sec)
}

function modelHasReasoningEfforts(text, provider, modelId) {
  const lines = text.split(/\r?\n/)
  for (const sec of parsePiAiSections(text)) {
    if (sec.provider !== provider) continue
    for (const m of sec.models) {
      if (m.modelId !== modelId) continue
      for (let j = m.start + 1; j <= m.end; j++) {
        const trimmed = lines[j] ? lines[j].trim() : ''
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
    for (const modelId of models) {
      if (modelHasReasoningEfforts(text, provider, modelId)) continue
      const targetModel = providerSection.models.find(m => m.modelId === modelId)
      const ln = text.split(/\r?\n/)
      if (targetModel) {
        // Existing model: insert only compat + reasoningEfforts after its end
        const indent = (ln[targetModel.start] || '').match(/^\s*/)[0]
        const block = '\n' + declarationBlock(indent)
        ln.splice(targetModel.end + 1, 0, block)
      } else {
        // New model: insert full modelBlock
        const block = '\n' + modelBlock(modelId, modelId, '        ')
        ln.splice(providerSection.modelsEnd + 1, 0, block)
      }
      text = ln.join('\n'); needWrite = true
      sections = parsePiAiSections(text)
      const ns = sections.find(s => s.provider === provider)
      if (ns) { providerSection.models = ns.models; providerSection.modelsEnd = ns.modelsEnd }
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

  // --- Step 1: pi-ai patch (all found locations) ---
  let piAiLocations = args.piAi ? [args.piAi] : findAllPiAiLocations(cwd)
  if (piAiLocations.length === 0) {
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
  let patchedAny = false, alreadyAll = true
  log(`[1/${piAiLocations.length + 1}] pi-ai adapter (${piAiLocations.length} installs found)`)
  for (const loc of piAiLocations) {
    try {
      const r = applyPiAiPatch(loc, args.dryRun)
      if (r.status === 'already') { log(`  ✓ ${loc}\n    (already patched, skipping)`) }
      else if (r.status === 'would-patch') { log(`  ✓ would patch ${loc}\n    (dry-run)`); patchedAny = true }
      else { log(`  ✓ patched ${loc}\n    (backup: ${r.backup})`); patchedAny = true; alreadyAll = false }
    } catch (e) { warn(`  ✗ ${loc}: ${e.message}`) }
  }

  // --- List mode ---
  if (args.list) {
    log('\n[--list] Current settings:')
    cmdList(args.settings || defaultSettingsPath())
    return
  }

  // --- Off mode ---
  if (args.off) {
    log('\n[2/2] --off mode: no configuration files changed')
    log('\nDone. Reasoning effort is enabled. Restart DSH to take effect.')
    return
  }

  // --- Step 2: settings merge ---
  const settingsPath = args.settings || defaultSettingsPath()
  log(`[2/2] settings: ${settingsPath}`)

  let provider = args.provider
  let models = args.models ? args.models.split(',').map(s => s.trim()).filter(Boolean) : []
  let autoDetected = false

  // Auto-detect provider/models from settings.yaml when not explicitly given
  if (!provider || models.length === 0) {
    if (fs.existsSync(settingsPath)) {
      const existingText = fs.readFileSync(settingsPath, 'utf8')
      const sections = parsePiAiSections(existingText)
      if (sections.length > 0) {
        // Auto-detect all providers and their models
        for (const sec of sections) {
          const missingModels = sec.models.filter(m => !modelHasReasoningEfforts(existingText, sec.provider, m.modelId)).map(m => m.modelId)
          if (missingModels.length === 0) continue
          autoDetected = true
          log(`  ℹ Auto-detected provider "${sec.provider}" — writing declarations for: ${missingModels.join(', ')}`)
          try {
            const r = mergeSettings(settingsPath, sec.provider, missingModels, args.dryRun)
            log('  ' + ({ already: '✓ already declared', merged: '✓ updated', 'would-merge': '✓ would update (dry-run)' }[r.status] || r.status))
          } catch (e) { warn(e.message) }
        }
        // If no provider was specified, set a flag to skip the generic block
        if (!args.provider) { provider = '__auto__'; models = [] }
      }
    }
  }

  // If we still have a specific provider/models to write (from --provider/--models or fallback)
  if (provider && provider !== '__auto__' && models.length > 0) {
    try {
      const r = mergeSettings(settingsPath, provider, models, args.dryRun)
      const statusMap = { already: '✓ already declared, skipping', merged: '✓ updated', 'would-merge': '✓ would update (dry-run)' }
      log('  ' + (statusMap[r.status] || r.status))
    } catch (e) { die(e.message) }

    // Verify (any location patched)
    if (!args.dryRun) {
      const finalSettings = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : ''
      const okPatch = patchedAny || piAiLocations.every(loc => {
        try { return fs.readFileSync(loc, 'utf8').includes(PATCH_MARKER) } catch (_) { return false }
      })
      const okSettings = /reasoningEfforts\s*:/.test(finalSettings)
      if (okPatch && okSettings) log('\nDone. Restart DSH to use.')
      else {
        warn('\nPartial check:')
        if (!okPatch) warn('  - pi-ai patch not found')
        if (!okSettings) warn('  - settings.yaml missing reasoningEfforts declarations')
      }
    }
  } else {
    if (!autoDetected) {
      log('  No existing pi-ai provider/models found in settings.yaml.')
      printTemplate()
      log('\nTo write config automatically:')
      log('  node install.js --provider <name> --models <model1,model2>')
      log('To preview changes:')
      log('  node install.js --dry-run --provider <name> --models <model1,model2>')
    }
  }
}

main()