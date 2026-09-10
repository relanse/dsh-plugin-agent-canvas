#!/usr/bin/env node
/**
 * i18n 词表同步：locales/zh.ts 是唯一事实来源，en.ts 自动对齐。
 *
 * 用法：
 *   node scripts/i18n-sync.mjs          # 同步：补翻缺失 key（调 DeepSeek）、清理多余 key
 *   node scripts/i18n-sync.mjs --check  # 只检查不修改，不同步则退出码 1（pre-commit 用）
 *
 * API Key 来源：环境变量 DEEPSEEK_API_KEY，缺省读 backend/.env。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ZH_PATH = path.join(ROOT, 'src/client/i18n/locales/zh.ts')
const EN_PATH = path.join(ROOT, 'src/client/i18n/locales/en.ts')
const CHECK_MODE = process.argv.includes('--check')

// ---------- TS 词表加载：transpile 到 CJS 后求值（词表是纯对象，无外部 import） ----------

function loadDict(file, exportName) {
  const src = readFileSync(file, 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  new Function('module', 'exports', js)(mod, mod.exports)
  return mod.exports[exportName]
}

// ---------- 从 zh.ts 源码提取分组注释与分组结构，生成时原样镜像 ----------

function parseSections(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const sections = []
  let current = null
  let pendingComment = null
  for (const line of lines) {
    const cm = line.match(/^\s*\/\/\s?(.*)$/)
    if (cm) {
      pendingComment = cm[1].trim()
      continue
    }
    const km = line.match(/^\s*'([^']+)':/)
    if (km) {
      if (!current || current.comment !== pendingComment) {
        current = { comment: pendingComment, keys: [] }
        sections.push(current)
      }
      current.keys.push(km[1])
      pendingComment = null
    }
  }
  return sections
}

// ---------- DeepSeek 翻译（JSON 模式，非流式） ----------

function loadApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  try {
    const env = readFileSync(path.join(ROOT, 'backend/.env'), 'utf8')
    const m = env.match(/^DEEPSEEK_API_KEY=(.+)$/m)
    if (m) return m[1].trim()
  } catch {
    /* backend/.env 不存在时走环境变量 */
  }
  return ''
}

async function translateBatch(pairs) {
  const apiKey = loadApiKey()
  if (!apiKey) {
    console.error('✗ 未找到 DEEPSEEK_API_KEY（环境变量或 backend/.env）')
    process.exit(1)
  }
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  const payload = Object.fromEntries(pairs)

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 1.1,
      messages: [
        {
          role: 'system',
          content:
            '你是前端 i18n 翻译引擎。输入是 JSON（key→简体中文文案），' +
            '输出必须是同结构 JSON（相同 key→简洁地道的英文界面文案）。' +
            '规则：{name} 形式的插值占位符必须原样保留且不增删；' +
            '保持 UI 用语风格（短、祈使句）；不要输出任何解释。',
        },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  })
  if (!res.ok) {
    console.error(`✗ DeepSeek API ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
  const data = await res.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  return parsed
}

// ---------- en.ts 生成 ----------

function renderEn(sections, zh, en) {
  const out = []
  out.push('/**')
  out.push(' * English dictionary — 本文件由 scripts/i18n-sync.mjs 自动生成，请勿手工编辑。')
  out.push(' * 简体中文词表 locales/zh.ts 是唯一事实来源；新增或修改文案后运行：')
  out.push(' *   npm run i18n:sync   （缺失 key 由 DeepSeek 自动翻译补齐）')
  out.push(' */')
  out.push('')
  out.push("import type { MessageKey } from './zh'")
  out.push('')
  out.push('export type Messages = Record<MessageKey, string>')
  out.push('')
  out.push('export const en: Messages = {')
  for (const sec of sections) {
    if (sec.comment) out.push(`  // ${sec.comment}`)
    for (const key of sec.keys) {
      out.push(`  ${JSON.stringify(key)}: ${JSON.stringify(en[key] ?? zh[key])},`)
    }
    out.push('')
  }
  // 去掉末尾多余空行，保留一个换行
  while (out.length && out[out.length - 1] === '') out.pop()
  out.push('}')
  return out.join('\n') + '\n'
}

// ---------- 主流程 ----------

const zh = loadDict(ZH_PATH, 'zh')
const en = loadDict(EN_PATH, 'en')
const zhKeys = Object.keys(zh)
const enKeys = Object.keys(en)

const missing = zhKeys.filter((k) => !(k in en))
const stale = enKeys.filter((k) => !(k in zh))
const empty = zhKeys.filter((k) => k in en && typeof en[k] === 'string' && en[k].trim() === '')

if (!missing.length && !stale.length && !empty.length) {
  console.log(`✓ i18n 词表同步（zh ${zhKeys.length} keys / en ${enKeys.length} keys）`)
  process.exit(0)
}

if (CHECK_MODE) {
  if (missing.length) console.error(`✗ en 缺失 ${missing.length} 个 key：${missing.join(', ')}`)
  if (stale.length) console.error(`✗ en 多余 ${stale.length} 个 key（zh 已删除）：${stale.join(', ')}`)
  if (empty.length) console.error(`✗ en 空值 key：${empty.join(', ')}`)
  console.error('  修复：npm run i18n:sync')
  process.exit(1)
}

const nextEn = {}
for (const k of zhKeys) nextEn[k] = en[k] // 按 zh 顺序保留既有翻译（自动剔除 stale）

if (missing.length) {
  console.log(`→ DeepSeek 翻译 ${missing.length} 个缺失 key…`)
  const translated = await translateBatch(missing.map((k) => [k, zh[k]]))
  for (const k of missing) {
    nextEn[k] = typeof translated[k] === 'string' && translated[k].trim() ? translated[k] : zh[k]
    console.log(`  ${k}: ${zh[k]} → ${nextEn[k]}`)
    if (nextEn[k] === zh[k]) console.warn(`  ⚠ key ${k} 翻译缺失，暂以中文兜底`)
  }
}

writeFileSync(EN_PATH, renderEn(parseSections(ZH_PATH), zh, nextEn), 'utf8')
console.log(
  `✓ en.ts 已生成：补翻 ${missing.length}、清理 ${stale.length}${stale.length ? `（${stale.join(', ')}）` : ''}`,
)
