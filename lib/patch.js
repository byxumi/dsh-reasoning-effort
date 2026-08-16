'use strict'

/**
 * Shared pi-ai patch logic for dsh-reasoning-effort.
 * Used by both install.js (CLI) and lib/index.js (plugin apply self-heal).
 *
 * The patch modifies `resolveModelCompat` in @deepseek-ai/dsh-llm-pi-ai to
 * forward compat fields (supportsDeveloperRole, supportsStore, maxTokensField)
 * alongside the already-forwarded supportsReasoningEffort. This fixes 400
 * errors from OpenRouter-style gateways rejecting `developer` role or `store`.
 */

const fs = require('fs')
const path = require('path')

const PATCH_MARKER = 'supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole }'

/**
 * Apply the pi-ai patch to one file. Idempotent: returns { status: 'already' }
 * when the spread marker is already present.
 */
function applyPiAiPatch(indexPath, dryRun) {
  let src = fs.readFileSync(indexPath, 'utf8')
  const lines = src.split('\n')

  const isFullyPatched = lines.some(l => l.includes('...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole }'))
  if (isFullyPatched) return { status: 'already' }

  const fnIdx = lines.findIndex(l => l.includes('function resolveModelCompat'))
  if (fnIdx < 0) {
    throw new Error(`Cannot find resolveModelCompat in ${indexPath}.`)
  }

  const headLines = lines.slice(0, fnIdx)
  let insertedHead = false
  for (let i = fnIdx; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
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
    if (trimmed.startsWith('if (thinkingFormat === void 0 && supportsReasoningEffort === void 0') && !trimmed.includes('supportsDeveloperRole')) {
      headLines.push(line.replace(
        'if (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};',
        'if (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};'
      ))
      continue
    }
    headLines.push(line)
  }

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
      if (trimmed.includes('...supportsDeveloperRole') || trimmed.includes('...supportsStore') || trimmed.includes('...maxTokensField')) {
        if (insertedTail) continue
      }
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

/**
 * Is this file already carrying the full patch (idempotency probe)?
 */
function isPiAiPatched(indexPath) {
  if (!fs.existsSync(indexPath)) return false
  const src = fs.readFileSync(indexPath, 'utf8')
  return src.includes('...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole }')
}

module.exports = { applyPiAiPatch, isPiAiPatched, PATCH_MARKER, PKG: 'dsh-reasoning-effort' }