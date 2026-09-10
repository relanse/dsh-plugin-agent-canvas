/**
 * DSH `tool.call.toolview` slot owner props 的结构子集。
 *
 * 平台类型住在 @deepseek-ai/dsh-client-ui-chat —— client bundle 只允许
 * 平台白名单模块，插件侧不引它，按「两侧类型各自声明」的解耦约定自持。
 * 判别方式与官方一致：running 形态无 kind 字段、直接携带 argsRaw；
 * settle 后是 tool-result 节点，参数在 call.argsRaw、结果在 content。
 */

export interface RunningToolCallLike {
  callId: string
  name?: string
  argsRaw: string
}

export interface ToolResultNodeLike {
  kind: 'tool-result'
  callId: string
  call: { name: string; argsRaw: string } | null
  content: readonly unknown[]
  isError?: boolean
  error?: { name?: string; code?: string; message?: string }
}

export type ToolCallBlockLike = RunningToolCallLike | ToolResultNodeLike

/** 调用生命周期状态，与官方 ToolRowState 对齐 */
export type CallState = 'running' | 'ok' | 'error' | 'stopped'

/** 平台注入的面板 props；独立渲染（无宿主）时全部可缺省 */
export interface AgentCanvasPanelProps {
  callId?: string
  toolName?: string
  block?: ToolCallBlockLike
}

/** run_workflow 的线协议参数形状（与 Go 后端 DAGRequest 对应） */
export interface WireNode {
  id: string
  type: string
  data?: Record<string, unknown>
}

export interface WireEdge {
  source: string
  target: string
}

export interface WireDAG {
  nodes: WireNode[]
  edges: WireEdge[]
  userInput: string
}
