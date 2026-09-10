import { useMemo } from 'react'
import type { CallState, ToolCallBlockLike, ToolResultNodeLike, WireDAG } from '../types/toolview'

/** 与官方 toolRowModel 同构的参数提取：running 直取 argsRaw，settle 后从 call 头取 */
function argsRawOf(block: ToolCallBlockLike): string {
  return ('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? ''
}

/** 与官方 resultText 同构的结果扁平化：text 块取原文，其余形状 JSON 序列化 */
function resultText(node: ToolResultNodeLike): string {
  const parts: string[] = []
  for (const block of node.content) {
    if (typeof block === 'object' && block !== null && (block as { type?: string }).type === 'text') {
      parts.push(String((block as { text?: string }).text ?? ''))
    } else {
      parts.push(JSON.stringify(block, null, 2))
    }
  }
  if (parts.length === 0 && node.error !== undefined) {
    parts.push(`${node.error.name ?? 'error'}: ${node.error.code ?? ''}`)
  }
  return parts.join('\n')
}

/** 解析 run_workflow 的调用参数为画布可用的 DAG；非法 / 截断的 JSON 返回 null */
export function parseWireDAG(argsRaw: string): WireDAG | null {
  if (argsRaw === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    return null // 流中截断或模型 JSON 格式错误：不水合，画布保持独立可用
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { nodes, edges, userInput } = parsed as Record<string, unknown>
  if (!Array.isArray(nodes) || (edges !== undefined && !Array.isArray(edges))) return null

  const wireNodes = nodes.filter(
    (n): n is WireDAG['nodes'][number] =>
      typeof n === 'object' && n !== null && typeof (n as { id?: unknown }).id === 'string',
  )
  const wireEdges = (Array.isArray(edges) ? edges : []).filter(
    (e): e is WireDAG['edges'][number] =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as { source?: unknown }).source === 'string' &&
      typeof (e as { target?: unknown }).target === 'string',
  )
  if (wireNodes.length === 0) return null
  return { nodes: wireNodes, edges: wireEdges, userInput: typeof userInput === 'string' ? userInput : '' }
}

export interface CallImportInfo {
  /** 本次调用的稳定标识（水合去重用） */
  callId: string | undefined
  /** 参数解析出的 DAG；解析失败或无参数时为 null */
  dag: WireDAG | null
  /** 调用生命周期状态 */
  state: CallState
  /** settle 后的扁平化结果文本；running 期间为 null */
  output: string | null
}

/** 从平台注入的 block 推导导入信息（纯函数推导，水合动作由面板按一次性规则执行） */
export function useCallImport(block: ToolCallBlockLike | undefined): CallImportInfo {
  return useMemo(() => {
    if (block === undefined) {
      return { callId: undefined, dag: null, state: 'running' as CallState, output: null }
    }
    const done = 'kind' in block
    const state: CallState = !done
      ? 'running'
      : block.error?.code === 'interrupted'
        ? 'stopped'
        : block.isError
          ? 'error'
          : 'ok'
    const output = done ? (resultText(block) || null) : null
    return { callId: block.callId, dag: parseWireDAG(argsRawOf(block)), state, output }
  }, [block])
}
