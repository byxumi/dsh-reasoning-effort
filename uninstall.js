#!/usr/bin/env node
/**
 * DSH Reasoning Effort Uninstaller
 * =================================
 * Reverts the changes made by install.js:
 *  1. Restores the pi-ai adapter backup (lib/index.js.dsh-reasoning.bak)
 *  2. Removes compat and reasoningEfforts from settings.yaml model declarations
 *
 * Usage:
 *   node uninstall.js                             # auto-detect + interactive
 *   node uninstall.js --provider my-gw --models m1,m2  # remove specific
 *   node uninstall.js --all                       # remove all declarations
 *   node uninstall.js --pi-ai-only                # only restore pi-ai patch
 *   node uninstall.js --dry-run                   # preview changes
 */

'use strict'

if (process.platform === 'win32' && process.stdout?.isTTY) {
  try {
    require('child_process').execSync('chcp 65001 >NUL', { stdio: 'ignore', timeout: 1000 })
  } catch (_) { /* ignore */ }
}

const fs = require('fs')
const path = require('path')
const os = require('os')

// ===========================================================================
//  Constants
// ===========================================================================

const PKG = 'dsh-reasoning-effort'
const VERSION = '1.4.0'
const BACKUP_SUFFIX = '.dsh-reasoning.bak'
const PI_AI_REL = path.join('@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')

// Reverse patch markers (identical to install.js for detecting the patch)
const PATCH_MARKER = 'supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole }'
const PATCHED_HEAD = 'const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;\n' +
  '\tconst supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;\n' +
  '\tconst supportsDeveloperRole = entry.compat?.supportsDeveloperRole ?? route?.supportsDeveloperRole;\n' +
  '\tconst supportsStore = entry.compat?.supportsStore ?? route?.supportsStore;\n' +
  '\tconst maxTokensField = entry.compat?.maxTokensField ?? route?.maxTokensField;\n' +
  '\tif (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};'
const ORIGINAL_HEAD = 'const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;\n' +
  '\tconst supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;\n' +
  '\tif (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};'
const PATCHED_FN_TAIL = 'supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort },\n' +
  '\t\t...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole },\n' +
  '\t\t...supportsStore === void 0 ? {} : { supportsStore },\n' +
  '\t\t...maxTokensField === void 0 ? {} : { maxTokensField }\n\t}; };'
const ORIGINAL_FN_TAIL = 'supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort }\n\t}; };'

// ===========================================================================
//  CLI
// ===========================================================================

function parseArgs(argv) {
  const args = { piAi: null, settings: null, provider: null, models: null, all: false, piAiOnly: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pi-ai') args.piAi = argv[++i]
    else if (a === '--settings') args.settings = argv[++i]
    else if (a === '--provider') args.provider = argv[++i]
    else if (a === '--models') args.models = argv[++i]
    else if (a === '--all') args.all = true
    else if (a === '--pi-ai-only') args.piAiOnly = true
    else if (a === '--dry-run' || a === '-n') args.dryRun = true
    else if (a === '--version' || a === '-v') { console.log(`${PKG} v${VERSION}`); process.exit(0) }
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
  }
  return args
}

function printHelp() {
  console.log(`
${PKG} v${VERSION} — DSH reasoning effort uninstaller

USAGE:
  node uninstall.js [options]

OPTIONS:
  --provider <name>     Provider name to clean up
  --models <list>       Comma-separated model IDs to clean
  --all                 Remove ALL compat/reasoningEfforts from settings.yaml
  --pi-ai-only          Only restore pi-ai patch, skip settings.yaml
  --pi-ai <path>        Path to dsh-llm-pi-ai/lib/index.js (auto-detected)
  --settings <path>     Path to settings.yaml (default: ~/.dsh/settings.yaml)
  --dry-run, -n         Preview changes without writing files
  --version, -v         Show version
  --help, -h            Show this help

EXAMPLES:
  node uninstall.js                          # auto-detect
  node uninstall.js --provider mygw --models m1,m2
  node uninstall.js --all
  node uninstall.js --pi-ai-only
`)
}

// ===========================================================================
//  Pi-ai locator (reuse from install.js)
// ===========================================================================

function piAiCandidate(pkgRoot) { return path.join(pkgRoot, PI_AI_REL) }

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

function scanForPiAi(root, depth, maxDepth) {
  if (depth > maxDepth) return null
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const p = path.join(root, e.name)
      if (e.name === 'node_modules') {
        const direct = piAiCandidate(p)
        if (fs.existsSync(direct)) return direct
        const pnpm = findInPnpmStore(p)
        if (pnpm) return pnpm
        const found = scanForPiAi(p, depth + 1, maxDepth + 1)
        if (found) return found
        continue
      }
      const direct = piAiCandidate(p)
      if (fs.existsSync(direct)) return direct
      const found = scanForPiAi(p, depth + 1, maxDepth)
      if (found) return found
    }
  } catch (_) { /* ignore */ }
  return null
}

// ===========================================================================
//  Multi-location discovery (mirrors install.js)
// ===========================================================================

// Find the pi-ai package inside a pnpm virtual store root.
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
function findAllPiAiLocations(cwd) {
  const found = new Map()
  function add(p) {
    if (p && fs.existsSync(p)) {
      const norm = path.resolve(p)
      if (!found.has(norm)) found.set(norm, true)
    }
  }
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
    path.join(home, 'AppData', 'Local', 'npm-cache', '_npx'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules'),
    path.join(home, 'AppData', 'Local', 'pnpm'),
    path.join(home, 'AppData', 'Local', 'pnpm', 'global'),
    path.join(home, 'AppData', 'Local', 'pnpm', 'store'),
    path.join(home, 'AppData', 'Local', 'pnpm', 'global', '5', 'node_modules'),
    // Desktop Electron runtimes
    ...desktopRuntimeRoots(),
    path.join(home, '.npm', '_npx'),
    path.join(home, '.npm', 'node_modules'),
    path.join('/usr', 'local', 'lib', 'node_modules'),
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
  try {
    const g = require('child_process').execSync('npm root -g', { encoding: 'utf8', timeout: 10000 }).trim()
    if (g) roots.push(g)
  } catch (_) { /* ignore */ }

  for (const base of roots) {
    if (!base || !fs.existsSync(base)) continue
    try {
      add(piAiCandidate(base))
      add(findInPnpmStore(base))
      collectScan(base, add, 0, 4)
    } catch (_) { /* ignore */ }
  }

  // where dsh / which dsh
  try {
    const isWin = process.platform === 'win32'
    const outs = require('child_process').execSync(isWin ? 'where dsh' : 'which dsh', { encoding: 'utf8', timeout: 5000 })
    const dshPaths = outs.split(/\r?\n/).filter(s => s.trim())
    for (const dshPath of dshPaths.slice(0, 3)) {
      if (!dshPath) continue
      let real = dshPath
      try { real = fs.realpathSync(dshPath) } catch (_) { /* keep original */ }
      const dshDir = path.dirname(path.resolve(real))
      let walk = dshDir
      for (let i = 0; i < 8; i++) {
        const nm = path.join(walk, 'node_modules')
        if (fs.existsSync(nm)) {
          add(piAiCandidate(nm))
          add(findInPnpmStore(nm))
          const dshPkg = path.join(nm, '@deepseek-ai', 'dsh')
          if (fs.existsSync(dshPkg)) {
            add(piAiCandidate(path.join(dshPkg, 'node_modules')))
          }
        }
        const parent = path.dirname(walk)
        if (parent === walk) break
        walk = parent
      }
      add(piAiCandidate(path.join(dshDir, 'node_modules')))
    }
  } catch (_) { /* ignore */ }

  // pnpm root -g
  try {
    const pr = require('child_process').execSync('pnpm root -g', { encoding: 'utf8', timeout: 10000 }).trim()
    if (pr) { add(piAiCandidate(pr)); add(findInPnpmStore(pr)) }
  } catch (_) { /* ignore */ }

  // require.resolve
  try {
    const r = require.resolve('@deepseek-ai/dsh-llm-pi-ai/lib/index')
    if (r) add(r)
  } catch (_) { /* ignore */ }

  return Array.from(found.keys())
}

// Desktop Electron app runtime heuristic
function desktopRuntimeRoots() {
  const roots = []
  const candidates = []
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

// Collect every matching index.js under root
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

function findPiAiIndex(cwd) {
  const all = findAllPiAiLocations(cwd)
  return all.length > 0 ? all[0] : null
}

// ===========================================================================
//  Uninstall functions
// ===========================================================================

function restorePiAiPatch(indexPath, dryRun) {
  const bakPath = indexPath + BACKUP_SUFFIX
  if (fs.existsSync(bakPath)) {
    if (dryRun) return { status: 'would-restore', path: indexPath, backup: bakPath }
    fs.writeFileSync(indexPath, fs.readFileSync(bakPath, 'utf8'), 'utf8')
    fs.unlinkSync(bakPath)
    return { status: 'restored', path: indexPath, backup: bakPath }
  }
  // No backup file — reverse patch (revert the compat forwarding changes)
  try {
    const src = fs.readFileSync(indexPath, 'utf8')
    // Check if the file is actually patched
    const isPatched = src.includes('supportsDeveloperRole') || src.includes('supportsStore') || src.includes('maxTokensField')
    if (!isPatched) return { status: 'no-backup-unpatched', path: indexPath }
    if (dryRun) return { status: 'would-reverse', path: indexPath }

    // Line-based reverse patch:
    //  1. Remove the 3 head variable declarations
    //  2. Restore the if condition
    //  3. Remove the 3 return spread lines
    const lines = src.split('\n')
    const out = []
    let removed = 0
    let inCompat = false
    for (const line of lines) {
      const t = line.trim()

      // 1. head declarations
      if (t.startsWith('const supportsDeveloperRole =') ||
          t.startsWith('const supportsStore =') ||
          t.startsWith('const maxTokensField =')) {
        removed++
        continue
      }
      // 2. if condition: restore original
      if (t === 'if (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};') {
        out.push(line.replace(
          'if (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};',
          'if (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};'
        ))
        removed++
        continue
      }
      // 3. return block spreads
      if (t === 'return { compat: {') { inCompat = true; out.push(line); continue }
      if (inCompat) {
        if (t.includes('supportsDeveloperRole') || t.includes('supportsStore') || t.includes('maxTokensField')) {
          removed++
          continue
        }
        if (t === '} };' || t === '};' || t === '}' || t === '}') { inCompat = false }
        out.push(line)
        continue
      }
      out.push(line)
    }
    if (removed === 0) return { status: 'no-backup-reverse-failed', path: indexPath }

    fs.writeFileSync(indexPath + '.dsh-uninstall-safety.bak', src, 'utf8')
    fs.writeFileSync(indexPath, out.join('\n'), 'utf8')
    return { status: 'reverse-restored', path: indexPath, removed }
  } catch (e) {
    return { status: 'no-backup-reverse-error', path: indexPath, error: e.message }
  }
}

// ===========================================================================
//  Settings.yaml cleaner
// ===========================================================================

function defaultSettingsPath() { return path.join(os.homedir(), '.dsh', 'settings.yaml') }

const indentOf = (line) => (line.match(/^\s*/) || [''])[0].length

function parsePiAiSections(text) {
  const lines = text.split(/\r?\n/); const sections = []
  let inPiAi = false, inProviders = false, current = null, inModels = false
  for (let i = 0; i < lines.length; i++) {
    const ind = indentOf(lines[i]), trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (!inPiAi) { if (/^llm-pi-ai\s*:/.test(trimmed)) inPiAi = true; continue }
    if (!inProviders) { if (/^providers\s*:/.test(trimmed)) { inProviders = true; continue } continue }
    if (ind === 4 && /^[A-Za-z0-9_-]+\s*:$/.test(trimmed) && !trimmed.startsWith('-')) {
      if (current) finalizeSection(current, lines, i)
      current = { provider: trimmed.replace(/:$/, ''), modelsStart: -1, modelsEnd: -1, models: [] }
      sections.push(current); inModels = false; continue
    }
    if (current && ind === 6 && /^models\s*:/.test(trimmed)) { inModels = true; if (current.modelsStart < 0) current.modelsStart = i; continue }
    if (current && inModels && ind >= 8 && /^- id:\s+(\S+)/.test(trimmed)) { current.models.push({ start: i, end: -1, modelId: trimmed.match(/^- id:\s+(\S+)/)[1] }); continue }
    if (ind === 0 && /^[A-Za-z0-9_-]+\s*\S*:/.test(trimmed) && !/^llm-pi-ai/.test(trimmed)) {
      if (current) finalizeSection(current, lines, i)
      inPiAi = false; inProviders = false; current = null; inModels = false; continue
    }
  }
  if (current) finalizeSection(current, lines, lines.length)
  return sections
}

function finalizeModelEnds(sec) {
  for (let i = 0; i < sec.models.length; i++) {
    const m = sec.models[i]; const next = sec.models[i + 1]
    m.end = next ? next.start - 1 : sec.modelsEnd
  }
}

function finalizeSection(sec, lines, endIndex) {
  if (sec.models.length === 0) { sec.modelsEnd = sec.modelsStart >= 0 ? sec.modelsStart : -1; return }
  const last = sec.models[sec.models.length - 1]; let end = last.start
  for (let j = last.start + 1; j < lines.length && j < endIndex; j++) {
    const ind = indentOf(lines[j]), trimmed = lines[j].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (ind <= 6) break
    end = j
  }
  sec.modelsEnd = end
  finalizeModelEnds(sec)
}

// Remove compat and reasoningEfforts from a specific model block (by line range)
function cleanModelBlock(text, lineStart, lineEnd) {
  const lines = text.split(/\r?\n/)
  const toRemove = []
  let inCompat = false, compatDepth = 0, compatStart = -1
  let inEfforts = false, effortsDepth = 0, effortsStart = -1

  for (let j = lineStart + 1; j <= lineEnd; j++) {
    const ind = indentOf(lines[j]), trimmed = lines[j].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    // compat block
    if (/^compat\s*:/.test(trimmed) && ind >= 8) {
      inCompat = true; compatStart = j; compatDepth = ind; continue
    }
    if (inCompat && ind > compatDepth) continue
    if (inCompat && ind === compatDepth) {
      toRemove.push({ start: compatStart, end: j - 1 })
      inCompat = false
    }
    // reasoningEfforts block
    if (/^reasoningEfforts\s*:/.test(trimmed) && ind >= 8) {
      inEfforts = true; effortsStart = j; effortsDepth = ind; continue
    }
    if (inEfforts && ind > effortsDepth) continue
    if (inEfforts && ind === effortsDepth) {
      toRemove.push({ start: effortsStart, end: j - 1 })
      inEfforts = false
    }
  }
  // Close any open blocks at the end
  if (inCompat) toRemove.push({ start: compatStart, end: lineEnd })
  if (inEfforts) toRemove.push({ start: effortsStart, end: lineEnd })

  // Remove from end to preserve line numbers
  toRemove.sort((a, b) => b.start - a.start)
  for (const r of toRemove) {
    lines.splice(r.start, r.end - r.start + 1)
  }
  return lines.join('\n')
}

// Check if a model has compat or reasoningEfforts
function modelHasDeclarations(text, provider, modelId) {
  const lines = text.split(/\r?\n/)
  for (const sec of parsePiAiSections(text)) {
    if (sec.provider !== provider) continue
    for (const m of sec.models) {
      if (m.modelId !== modelId) continue
      for (let j = m.start + 1; j <= m.end; j++) {
        const trimmed = lines[j].trim()
        if (/^compat\s*:/.test(trimmed) || /^reasoningEfforts\s*:/.test(trimmed)) return true
      }
      return false
    }
  }
  return false
}

function cleanSettings(settingsPath, provider, models, all, dryRun) {
  if (!fs.existsSync(settingsPath)) return { status: 'no-settings' }
  let text = fs.readFileSync(settingsPath, 'utf8')
  let needWrite = false

  if (all) {
    // Remove ALL compat and reasoningEfforts blocks from ALL models.
    // Process models from bottom to top to avoid line-number shifting.
    const sections = parsePiAiSections(text)
    const allModels = []
    for (const sec of sections) {
      for (const m of sec.models) {
        allModels.push({ provider: sec.provider, modelId: m.modelId, start: m.start, end: m.end })
      }
    }
    // Sort by end descending (bottom to top)
    allModels.sort((a, b) => b.end - a.end)
    for (const m of allModels) {
      if (!modelHasDeclarations(text, m.provider, m.modelId)) continue
      const newText = cleanModelBlock(text, m.start, m.end)
      if (newText !== text) { text = newText; needWrite = true }
    }
  } else if (provider && models) {
    // Process specified models from bottom to top
    const sections = parsePiAiSections(text)
    const sec = sections.find(s => s.provider === provider)
    if (sec) {
      const targets = models.map(id => sec.models.find(m => m.modelId === id)).filter(Boolean)
      targets.sort((a, b) => b.end - a.end)
      for (const m of targets) {
        if (!modelHasDeclarations(text, provider, m.modelId)) continue
        const newText = cleanModelBlock(text, m.start, m.end)
        if (newText !== text) { text = newText; needWrite = true }
      }
    }
  }

  if (needWrite && !dryRun) {
    fs.writeFileSync(settingsPath, text, 'utf8')
  }
  const status = needWrite ? (dryRun ? 'would-clean' : 'cleaned') : 'noop'
  return { status, path: settingsPath }
}

// ===========================================================================
//  Main
// ===========================================================================

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  const home = os.homedir()

  console.log(`=== ${PKG} Uninstaller ===\n`)

  // --- 1. Restore pi-ai patch (all found locations) ---
  const piAiLocations = args.piAi ? [args.piAi] : findAllPiAiLocations(cwd)
  if (piAiLocations.length === 0) {
    console.log('[1/1] pi-ai adapter: not found. Skipping.')
  } else {
    const n = piAiLocations.length
    console.log(`[1/${n + 1}] pi-ai adapter (${n} installs found)`)
    for (const loc of piAiLocations) {
      const r = restorePiAiPatch(loc, args.dryRun)
      const msgs = {
        'restored': '      🗑 restored from backup',
        'would-restore': '      🗑 would restore backup (dry-run)',
        'no-backup-unpatched': '      (no patch found — already reverted)',
        'no-backup-reverse-failed': '      ⚠ patch found but reverse failed (no backup)',
        'no-backup-reverse-error': '      ⚠ reverse error: ' + (r.error || ''),
        'reverse-restored': '      🗑 reverted via reverse patch (no backup)',
        'would-reverse': '      🗑 would revert (dry-run, no backup)',
      }
      console.log('  ' + loc)
      console.log(msgs[r.status] || '  ' + r.status)
      if (args.dryRun && r.status === 'would-restore') console.log('    (would restore backup: ' + r.backup + ')')
    }
  }

  if (args.piAiOnly) {
    console.log('\n--pi-ai-only mode: settings.yaml not modified.')
    console.log('\nDone.')
    return
  }

  // --- 2. Clean settings.yaml + remove from profile (one-shot full uninstall) ---
  const settingsPath = args.settings || defaultSettingsPath()
  console.log(`[2/2] settings: ${settingsPath}`)

  if (args.all) {
    // Full uninstall: restore pi-ai (done in step 1) + clean settings + remove profile entry
    const r = cleanSettings(settingsPath, null, null, true, args.dryRun)
    if (r.status === 'no-settings') console.log('  settings.yaml not found')
    else if (r.status === 'noop') console.log('  no declarations found to remove')
    else if (r.status === 'would-clean') console.log('  🗑 would remove all compat/reasoningEfforts (dry-run)')
    else console.log('  🗑 all compat and reasoningEfforts removed')

    // Remove from web profile
    try {
      const profileDir = path.join(os.homedir(), '.dsh', 'profiles', 'web')
      const pkgPath = path.join(profileDir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        let changed = false
        if (pkg.dependencies && pkg.dependencies['dsh-reasoning-effort']) {
          delete pkg.dependencies['dsh-reasoning-effort']
          changed = true
        }
        if (pkg.dsh?.profile?.bundles) {
          const i = pkg.dsh.profile.bundles.indexOf('dsh-reasoning-effort')
          if (i >= 0) { pkg.dsh.profile.bundles.splice(i, 1); changed = true }
        }
        if (changed && !args.dryRun) {
          fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
          console.log('  🗑 removed dsh-reasoning-effort from web Profile manifest')
        } else if (changed) {
          console.log('  🗑 would remove dsh-reasoning-effort from web Profile manifest (dry-run)')
        } else {
          console.log('  (dsh-reasoning-effort not in web Profile manifest)')
        }
      }
    } catch (_) { /* ignore */ }
  } else if (args.provider && args.models) {
    const models = args.models.split(',').map(s => s.trim()).filter(Boolean)
    const r = cleanSettings(settingsPath, args.provider, models, false, args.dryRun)
    if (r.status === 'no-settings') console.log('  settings.yaml not found')
    else if (r.status === 'noop') console.log('  no declarations found for ' + args.provider + '/' + models.join(','))
    else if (r.status === 'would-clean') console.log('  🗑 would remove declarations (dry-run)')
    else console.log('  🗑 declarations removed for ' + args.provider + '/' + models.join(','))
  } else {
    // Default: auto-detect and clean
    const s = fs.readFileSync(settingsPath, 'utf8')
    if (s.includes('reasoningEfforts:') || s.includes('compat:') && s.includes('supportsReasoningEffort: true')) {
      const r = cleanSettings(settingsPath, null, null, true, args.dryRun)
      if (r.status === 'cleaned' || r.status === 'would-clean') {
        console.log('  🗑 reasoning effort declarations removed from settings.yaml')
      } else {
        console.log('  (no declarations found in settings.yaml)')
      }
    } else {
      console.log('  (no reasoning effort declarations found in settings.yaml)')
    }
    // Try to remove from profile
    try {
      const profileDir = path.join(os.homedir(), '.dsh', 'profiles', 'web')
      const pkgPath = path.join(profileDir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        if (pkg.dsh?.profile?.bundles?.includes('dsh-reasoning-effort')) {
          console.log('  ℹ plugin still registered in web Profile. Run:')
          console.log('    dsh plugin --profile web remove dsh-reasoning-effort')
        }
      }
    } catch (_) { /* ignore */ }
  }

  console.log('\nDone. Restart DSH to take effect.')
}

main()