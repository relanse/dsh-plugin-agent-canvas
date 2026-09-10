/**
 * 共享类型定义，供 client 端各模块复用。
 */

export type NodeType = 'llm' | 'tool' | 'condition' | 'rag'
export type NodeStatus = 'idle' | 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface NodeData {
  nodeType: NodeType
  label: string
  status?: NodeStatus
  // LLM 节点
  model?: string
  systemPrompt?: string
  temperature?: number
  maxSteps?: number
  // Tool 节点
  toolName?: string
  staticArgs?: Record<string, unknown>
  // Condition 节点
  condition?: string
  // RAG 节点
  knowledgeBaseId?: string
  topK?: number
  rerankTopK?: number
  threshold?: number
}

export interface FlowNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: NodeData
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  animated?: boolean
}

export interface DAGRequest {
  nodes: Array<{ id: string; type: NodeType; data: NodeData }>
  edges: Array<{ source: string; target: string }>
  userInput?: string
}

export interface SSEEvent {
  type: string
  nodeId?: string
  payload?: unknown
}

// tool_call payload
export interface ToolCallPayload {
  callId: string
  toolName: string
  args: Record<string, unknown>
}

// tool_result payload
export interface ToolResultPayload {
  callId: string
  toolName: string
  result: string
  durationMs: number
}

// tool_error payload
export interface ToolErrorPayload {
  callId: string
  toolName: string
  error: string
  retryCount: number
}
