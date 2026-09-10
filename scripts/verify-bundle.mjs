#!/usr/bin/env node
/**
 * 构建产物自检：tsdown 对解析失败的依赖只发 warning 并静默外置，
 * 产出一个运行时才炸的坏包（dsh-tools 恒等 stub 事故的同款失败模式）。
 * 本脚本把「产物正确」变成可执行断言，挂在 npm run bundle 之后。
 *
 * 校验项：
 *  1. lib/index.js 可实际执行，注册的 run_workflow parameters 是投影后的
 *     JSON Schema（根节点 type==='object'）——证明内联的是真实 defineTool
 *  2. lib/index.js 不含对 dsh-tools 的运行时 require（它必须被内联）
 *  3. lib/client.js 含 ModuleLoader banner，且白名单外没有裸 require
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---- 1. host 产物实跑：注册工具并断言 schema 形状 ----
let registered = null
const fakeCtx = {
  tools: { register: (tool) => (registered = tool) },
}
const mod = await import(pathToFileURL(path.join(ROOT, 'lib/index.js')).href)
for (const exported of Object.values(mod)) {
  if (typeof exported === 'function') exported(fakeCtx)
}
assert.ok(registered, 'host 产物执行后未注册任何工具')
assert.equal(registered.name, 'run_workflow')

const params = registered.parameters
assert.equal(
  params?.type,
  'object',
  `parameters 必须是投影后的 JSON Schema（type:'object'），got ${JSON.stringify(params).slice(0, 80)}…`,
)
assert.ok(
  Array.isArray(params.required) && params.required.includes('nodes'),
  'parameters.required 应含 nodes（真实 defineTool 投影结果）',
)

// ---- 2. host 产物不得运行时 require dsh-tools ----
const hostSrc = readFileSync(path.join(ROOT, 'lib/index.js'), 'utf8')
assert.ok(
  !hostSrc.includes("require('@deepseek-ai/dsh-tools'") &&
    !hostSrc.includes('from"@deepseek-ai/dsh-tools"') &&
    !hostSrc.includes("from '@deepseek-ai/dsh-tools'"),
  'lib/index.js 引用了未内联的 @deepseek-ai/dsh-tools（构建时依赖解析失败？）',
)

// ---- 3. client 产物形态 ----
const clientSrc = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8')
assert.ok(
  clientSrc.includes('window.__ModuleLoader__.load'),
  'lib/client.js 缺少 ModuleLoader banner',
)
for (const m of clientSrc.matchAll(/require\((['"])([^'"]+)\1\)/g)) {
  const spec = m[2]
  assert.ok(
    /^@deepseek-ai\//.test(spec) || ['react', 'react-dom', 'dsh-client-store', 'ui-slots', 'ui-primitives', 'dockkit'].some((p) => spec === p || spec.startsWith(p + '/')),
    `lib/client.js 含白名单外的 require(${spec}) —— 非平台依赖必须内联`,
  )
}

console.log(`✓ 产物自检通过：run_workflow schema 已投影（required: [${params.required.join(', ')}]）、dsh-tools 已内联、client bundle 仅白名单 require`)
