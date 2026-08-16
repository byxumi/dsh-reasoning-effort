#!/usr/bin/env node
/**
 * DSH 推理强度 (reasoning effort) 通用安装器
 *
 * 设计原则：对任何模型/提供商都适用，不绑定特定供应商。
 *
 * 这个脚本做两件事：
 *  1. 给 @deepseek-ai/dsh-llm-pi-ai 打 compat 透传补丁（通用修复，适用于所有模型）
 *     - 让 settings 里的 compat 字段真正生效
 *     - 避免 developer role / store / max_completion_tokens 导致的 400 错误
 *  2. 按你的选择，把推理等级能力写进 $HOME/.dsh/settings.yaml
 *     - 显式指定 --provider/--models：自动为这些模型写入声明
 *     - 不带参数：只打补丁 + 打印通用配置模板，由你自己决定写哪些模型
 *       （不同模型支持的等级不同，脚本不猜测、不强加）
 *
 * 用法：
 *  node install.js                                       # 只打补丁，打印模板
 *  node install.js --provider my-provider --models model-a,model-b
 *  node install.js --provider openai --models gpt-5      # 任意 provider / 任意模型
 *  node install.js --off                                 # 只打补丁，完全不碰 settings
 *
 * 补充：`--off` 模式只打 pi-ai 补丁，不修改任何配置文件，最安全。
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

// ---------------------------------------------------------------------------
// 解析参数
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { piAi: null, settings: null, provider: null, models: null, off: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pi-ai') args.piAi = argv[++i]
    else if (a === '--settings') args.settings = argv[++i]
    else if (a === '--provider') args.provider = argv[++i]
    else if (a === '--models') args.models = argv[++i]
    else if (a === '--off') args.off = true
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
  }
  return args
}

function printHelp() {
  console.log(`
DSH 推理强度通用安装脚本

用法:
  node install.js [选项]

选项:
  --pi-ai <路径>      显式指定 @deepseek-ai/dsh-llm-pi-ai 包的 lib/index.js 路径
  --settings <路径>   显式指定 settings.yaml 路径
  --provider <名称>   要声明推理等级的 provider（任意名称，如 my-provider / openai / deepseek）
  --models <列表>     逗号分隔的模型 id 列表（任意模型）
  --off               只打 pi-ai 补丁，不修改任何配置文件（最安全）
  --help              显示本帮助

示例:
  node install.js                              # 只打补丁 + 打印通用模板
  node install.js --provider my-provider --models model-a,model-b
  node install.js --provider custom --models my-model-a,my-model-b
  node install.js --off                        # 完全不碰 settings

说明:
  • 不同模型支持的推理等级不同（有的只支持 high/max，有的支持 low~max）。
    脚本不会替你猜，只会按你显式指定的 provider/模型写入声明。
  • 不确定时用不带参数的方式运行，参考打印出的模板手动填写。
`)
}

// ---------------------------------------------------------------------------
// 1. 定位 pi-ai 包（只读定位，不改动任何运行中文件以外的东西）
// ---------------------------------------------------------------------------
function findPiAiIndex(cwd) {
  let dir = path.resolve(cwd)
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx'),
    path.join(os.homedir(), '.npm', '_npx'),
    path.join(os.homedir(), '.local', 'share', 'pnpm'),
  ]
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue
    const found = collectPiAi(base)
    if (found) return found
  }
  return null
}

function collectPiAi(root) {
  try {
    const entries = fs.readdirSync(root)
    for (const e of entries) {
      const p = path.join(root, e, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')
      if (fs.existsSync(p)) return p
    }
  } catch (_) { /* ignore */ }
  return null
}

// ---------------------------------------------------------------------------
// 2. 补丁内容（通用：只透传 compat 字段，对任何模型都安全）
// ---------------------------------------------------------------------------
const PATCH_MARKER = 'supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole }'

const ORIGINAL_FN_MARKER = 'supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort }\n\t} };'

const PATCHED_FN = `supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort },
		...supportsDeveloperRole === void 0 ? {} : { supportsDeveloperRole },
		...supportsStore === void 0 ? {} : { supportsStore },
		...maxTokensField === void 0 ? {} : { maxTokensField }
	} };`

const ORIGINAL_HEAD_MARKER = `const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;
	const supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;
	if (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};`

const PATCHED_HEAD = `const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;
	const supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;
	const supportsDeveloperRole = entry.compat?.supportsDeveloperRole ?? route?.supportsDeveloperRole;
	const supportsStore = entry.compat?.supportsStore ?? route?.supportsStore;
	const maxTokensField = entry.compat?.maxTokensField ?? route?.maxTokensField;
	if (thinkingFormat === void 0 && supportsReasoningEffort === void 0 && supportsDeveloperRole === void 0 && supportsStore === void 0 && maxTokensField === void 0) return {};`

function applyPiAiPatch(indexPath) {
  let src = fs.readFileSync(indexPath, 'utf8')
  if (src.includes(PATCH_MARKER)) {
    return { status: 'already', path: indexPath }
  }
  if (!src.includes(ORIGINAL_HEAD_MARKER)) {
    throw new Error(
      `无法在 ${indexPath} 找到预期的原始代码块。\n` +
      `这个版本的 dsh-llm-pi-ai 可能已经包含此修复，或代码结构已变化。\n` +
      `请检查该文件的 resolveModelCompat 函数，或使用 --pi-ai 指定正确的路径。`
    )
  }
  const bak = indexPath + '.dsh-reasoning.bak'
  fs.writeFileSync(bak, src, 'utf8')
  src = src.replace(ORIGINAL_HEAD_MARKER, PATCHED_HEAD)
  src = src.replace(ORIGINAL_FN_MARKER, PATCHED_FN)
  fs.writeFileSync(indexPath, src, 'utf8')
  return { status: 'patched', path: indexPath, backup: bak }
}

// ---------------------------------------------------------------------------
// 3. settings 通用合并（只写用户显式指定的 provider/模型）
// ---------------------------------------------------------------------------
function defaultSettingsPath() {
  return path.join(os.homedir(), '.dsh', 'settings.yaml')
}

function modelBlock(id, name, indent) {
  return (
`${indent}- id: ${id}
${indent}  name: ${name}
${indent}  contextWindow: 1000000
${indent}  maxTokens: 65536
${indent}  compat:
${indent}    supportsReasoningEffort: true
${indent}    supportsDeveloperRole: false
${indent}    supportsStore: false
${indent}    maxTokensField: max_tokens
${indent}  reasoningEfforts:
${indent}    off: null
${indent}    low: low
${indent}    medium: medium
${indent}    high: high
${indent}    xhigh: xhigh
${indent}    max: max`)
}

const indentOf = (line) => (line.match(/^\s*/) || [''])[0].length

function parsePiAiSections(text) {
  const lines = text.split(/\r?\n/)
  const sections = []
  let inPiAi = false, inProviders = false, current = null, inModels = false
  for (let i = 0; i < lines.length; i++) {
    const ind = indentOf(lines[i])
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (!inPiAi) {
      if (/^llm-pi-ai\s*:/.test(trimmed)) inPiAi = true
      continue
    }
    if (!inProviders) {
      if (/^providers\s*:/.test(trimmed)) { inProviders = true; continue }
      continue
    }
    if (ind === 4 && /^[A-Za-z0-9_-]+\s*:$/.test(trimmed) && !trimmed.startsWith('-')) {
      if (current !== null) endSection(current, lines, i)
      current = { provider: trimmed.replace(/:$/, ''), modelsStart: -1, modelsEnd: -1, models: [] }
      sections.push(current)
      inModels = false
      continue
    }
    if (current !== null && ind === 6 && /^models\s*:/.test(trimmed)) {
      inModels = true
      if (current.modelsStart < 0) current.modelsStart = i
      continue
    }
    if (current !== null && inModels && /^- id:\s+(\S+)/.test(trimmed)) {
      current.models.push({ index: i, modelId: trimmed.match(/^- id:\s+(\S+)/)[1] })
      continue
    }
    if (ind === 0 && /^[A-Za-z0-9_-]+\s*\S*:/.test(trimmed) && !/^llm-pi-ai/.test(trimmed)) {
      if (current !== null) endSection(current, lines, i)
      inPiAi = false; inProviders = false; current = null; inModels = false
      continue
    }
  }
  if (current !== null) endSection(current, lines, lines.length)
  return sections
}

function endSection(sec, lines, endIndex) {
  if (sec.models.length === 0) {
    sec.modelsEnd = sec.modelsStart >= 0 ? sec.modelsStart : -1
    return
  }
  const lastModel = sec.models[sec.models.length - 1]
  let end = lastModel.index
  for (let j = lastModel.index + 1; j < lines.length && j < endIndex; j++) {
    const ind = indentOf(lines[j])
    const trimmed = lines[j].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (ind <= 6) break
    end = j
  }
  sec.modelsEnd = end
}

function modelHasReasoningEfforts(settingsText, provider, modelId) {
  const lines = settingsText.split(/\r?\n/)
  for (const sec of parsePiAiSections(settingsText)) {
    if (sec.provider !== provider) continue
    for (const m of sec.models) {
      if (m.modelId !== modelId) continue
      for (let j = m.index + 1; j <= sec.modelsEnd; j++) {
        const ind = indentOf(lines[j])
        const trimmed = lines[j].trim()
        if (ind <= 8 && /^- id:/.test(trimmed)) break
        if (/^reasoningEfforts\s*:/.test(trimmed)) return true
      }
      return false
    }
  }
  return false
}

function mergeSettings(settingsPath, provider, models) {
  let text = ''
  if (fs.existsSync(settingsPath)) {
    text = fs.readFileSync(settingsPath, 'utf8')
  } else {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  }

  let needWrite = false
  let sections = parsePiAiSections(text)
  const providerSection = sections.find(s => s.provider === provider)

  if (providerSection && providerSection.modelsEnd >= 0) {
    for (const m of models) {
      if (modelHasReasoningEfforts(text, provider, m)) continue
      const block = modelBlock(m, m, '        ')
      const lines2 = text.split(/\r?\n/)
      lines2.splice(providerSection.modelsEnd + 1, 0, block)
      text = lines2.join('\n')
      needWrite = true
      sections = parsePiAiSections(text)
      const ns = sections.find(s => s.provider === provider)
      if (ns) providerSection.modelsEnd = ns.modelsEnd
    }
  } else if (providerSection) {
    const lines2 = text.split(/\r?\n/)
    const pIdx = lines2.findIndex(l => indentOf(l) === 4 && l.trim().replace(/:$/, '') === provider)
    if (pIdx >= 0) {
      let insertLines = ['      models:']
      for (const m of models) {
        if (modelHasReasoningEfforts(text, provider, m)) continue
        insertLines.push(modelBlock(m, m, '        '))
        needWrite = true
      }
      if (needWrite) {
        lines2.splice(pIdx + 1, 0, ...insertLines)
        text = lines2.join('\n')
      }
    }
  } else {
    const missing = models.filter(m => !modelHasReasoningEfforts(text, provider, m))
    if (missing.length > 0) {
      text = text.replace(/\s*$/, '') + '\n\nllm-pi-ai:\n  providers:\n    ' + provider + ':\n      api: openai-completions\n      models:\n'
      for (const m of missing) {
        text += modelBlock(m, m, '        ') + '\n'
      }
      needWrite = true
    }
  }

  if (needWrite) {
    fs.writeFileSync(settingsPath, text, 'utf8')
  }
  return { status: needWrite ? 'merged' : 'already', path: settingsPath }
}

// 通用配置模板（打印给用户参考，脚本不自动写入看不懂的模型）
function printTemplate() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
通用 settings.yaml 配置模板（按你的实际 provider/模型修改）

llm-pi-ai:
  providers:
    你的provider名称:
      displayName: 显示名称
      apiKeyEnv: 你的_API_KEY_环境变量
      api: openai-completions          # 或你的 API 兼容格式
      baseURL: https://你的网关地址/v1
      models:
        - id: 你的模型A
          name: 你的模型A
          compat:
            supportsReasoningEffort: true
            supportsDeveloperRole: false
            supportsStore: false
            maxTokensField: max_tokens
          reasoningEfforts:            # 只列这个模型真正支持的等级
            off: null
            low: low
            medium: medium
            high: high
            xhigh: xhigh
            max: max

注意:
  • reasoningEfforts 只应包含模型真正支持的等级。
    DeepSeek 官方只认 high/max；OpenAI 认 low/medium/high。
    列了不支持的等级，网关可能报 400。
  • 如果你不确定模型支持哪些，先只写 compat，不写 reasoningEfforts。
  • 也可以用脚本显式写入: node install.js --provider 名称 --models 模型1,模型2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()

  console.log('=== DSH 推理强度通用安装器 ===\n')

  // --- 1. pi-ai 补丁（通用，总是执行，除非 --off 也只是不动 settings） ---
  let piAiIndex = args.piAi
  if (!piAiIndex) piAiIndex = findPiAiIndex(cwd)
  if (!piAiIndex) {
    console.error('✗ 未找到 @deepseek-ai/dsh-llm-pi-ai 包。')
    console.error('  请用 --pi-ai 指定该包的 lib/index.js 路径。')
    process.exit(1)
  }
  console.log(`[1/2] 定位 pi-ai 适配器: ${piAiIndex}`)
  try {
    const r = applyPiAiPatch(piAiIndex)
    if (r.status === 'already') console.log('  ✓ 补丁已存在，跳过')
    else { console.log('  ✓ 补丁已应用 (备份: ' + r.backup + ')') }
  } catch (e) {
    console.error('  ✗ ' + e.message)
    process.exit(1)
  }

  // --- 2. settings（仅在显式指定 provider+models 时写，否则只打印模板） ---
  if (args.off) {
    console.log('[2/2] --off 模式：不改动任何配置文件')
    console.log('\n✓ 完成！pi-ai 补丁已生效，重启 DSH 后生效。')
    return
  }

  const settingsPath = args.settings || defaultSettingsPath()
  console.log(`[2/2] settings 文件: ${settingsPath}`)

  const provider = args.provider
  const models = args.models ? args.models.split(',').map(s => s.trim()).filter(Boolean) : []

  if (provider && models.length > 0) {
    try {
      const r = mergeSettings(settingsPath, provider, models)
      if (r.status === 'already') console.log(`  ✓ ${provider} 的这些模型已声明推理等级，跳过`)
      else console.log(`  ✓ settings 已更新: ${r.path}`)
    } catch (e) {
      console.error('  ✗ ' + e.message)
      process.exit(1)
    }
    // 校验
    const finalSettings = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : ''
    const piAiSrc = fs.readFileSync(piAiIndex, 'utf8')
    const okPatch = piAiSrc.includes(PATCH_MARKER)
    const okSettings = /reasoningEfforts\s*:/.test(finalSettings)
    if (okPatch && okSettings) {
      console.log('\n✓ 安装完成！')
    } else {
      console.log('\n⚠ 部分检查未通过:')
      if (!okPatch) console.log('  - pi-ai 补丁未生效')
      if (!okSettings) console.log('  - settings 未包含推理等级声明')
    }
    console.log('\n重启 DSH 进程后，在模型选择器中即可看到 Effort 入口。')
  } else {
    console.log('  未指定 --provider / --models，跳过自动写入（更安全，不猜模型能力）。')
    printTemplate()
    console.log('\n✓ pi-ai 补丁部分完成。要自动写入模型声明，请运行:')
    console.log('  node install.js --provider 你的provider --models 模型1,模型2')
  }
}

main()