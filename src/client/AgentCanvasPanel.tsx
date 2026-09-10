import { useState, useCallback, useEffect, useRef } from 'react'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import type { ReactFlowInstance } from 'reactflow'
import 'reactflow/dist/style.css'
import { Toolbar } from './components/Toolbar'
import { NodePalette } from './components/NodePalette'
import { GenUIPanel } from './components/GenUIPanel'
import { CallBanner } from './components/CallBanner'
import { LLMNode } from './components/Canvas/nodes/LLMNode'
import { ToolNode } from './components/Canvas/nodes/ToolNode'
import { ConditionNode } from './components/Canvas/nodes/ConditionNode'
import { RAGNode } from './components/Canvas/nodes/RAGNode'
import { useDAG } from './hooks/useDAG'
import { useNodeStatus } from './hooks/useNodeStatus'
import { useSSE } from './hooks/useSSE'
import { useCallImport } from './hooks/useCallImport'
import type { CanvasNode } from './hooks/useDAG'
import type { Edge } from 'reactflow'
import type { AgentCanvasPanelProps } from './types/toolview'
import type { SSEEvent } from './types'
import './styles/tokens.css'
import './styles/app.css'

const nodeTypes = { llm: LLMNode, tool: ToolNode, condition: ConditionNode, rag: RAGNode } as const

/** 每张调用卡独立持久化键；无宿主（无 callId）时共用 draft 键 */
function storageKeyFor(callId: string | undefined): string {
  return `agent-canvas:dag:${callId ?? 'draft'}`
}

/**
 * tool.call.toolview 面板。DSH 会注入本次调用的 owner props
 * （callId / toolName / block）：block 里的参数被水合进画布、
 * 结果展示在顶部信息条；无宿主独立渲染时面板照常可用。
 */
export function AgentCanvasPanel(props: AgentCanvasPanelProps = {}): JSX.Element {
  const {
    nodes, edges, dirty,
    onNodesChange, onEdgesChange, onConnect,
    serialize, addNode, clear, loadWire, loadCanvas,
  } = useDAG()
  const { statusMap, reset: resetStatus, handleEvent: handleStatusEvent } = useNodeStatus()
  const { start: startSSE, stop: stopSSE } = useSSE()
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<SSEEvent[]>([])

  const call = useCallImport(props.block)
  const storageKey = storageKeyFor(call.callId)

  // 挂载时恢复用户编辑（优先于 block 水合：编辑后的画布是用户数据）
  const restoredRef = useRef(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { nodes?: CanvasNode[]; edges?: Edge[] }
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        loadCanvas(parsed.nodes, Array.isArray(parsed.edges) ? parsed.edges : [])
        restoredRef.current = true
      }
    } catch {
      /* 坏数据当不存在，走 block 水合 */
    }
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 用户编辑防抖持久化（程序化装载不触发）
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ nodes, edges }))
      } catch {
        /* 存储配额满等异常：静默放弃本次持久化 */
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [nodes, edges, dirty, storageKey])

  // 一次性水合：同一 callId 只导入一次（running→settle 的 block 更新不重放），
  // 已恢复用户编辑时跳过；画布已有内容时也跳过，避免多次思考覆盖现有工作流
  // 导入后 fitView 让多节点 DAG 整体可见
  const rfRef = useRef<ReactFlowInstance | null>(null)
  const hydratedRef = useRef<string | null>(null)
  const hasHydratedOnce = useRef(false)
  useEffect(() => {
    if (call.dag === null || call.callId === undefined) return
    // 已经水合过任何一次，或已有用户内容，跳过后续水合
    if (hasHydratedOnce.current || restoredRef.current || nodes.length > 0) return
    // 同一 callId 不重复水合
    if (call.callId === hydratedRef.current) return
    loadWire(call.dag)
    hydratedRef.current = call.callId
    hasHydratedOnce.current = true
    const timer = setTimeout(() => rfRef.current?.fitView({ padding: 0.15, duration: 400 }), 60)
    return () => clearTimeout(timer)
  }, [call.dag, call.callId, nodes.length, loadWire])

  const handleRun = useCallback(() => {
    const dag = serialize()
    if (dag.nodes.length === 0) return
    setEvents([])
    setRunning(true)
    resetStatus(dag.nodes.map((n) => n.id))
    startSSE(
      dag,
      (event) => { setEvents((prev) => [...prev, event]); handleStatusEvent(event) },
      () => setRunning(false),
      (err) => { setEvents((prev) => [...prev, { type: 'workflow_error', payload: { error: err } }]); setRunning(false) },
    )
  }, [serialize, startSSE, resetStatus, handleStatusEvent])

  const handleStop = useCallback(() => { stopSSE(); setRunning(false) }, [stopSSE])

  // 清空 = 用户显式放弃当前画布：清存储、重置水合标记，
  // 允许后续导入新的工作流
  const handleClear = useCallback(() => {
    clear()
    try { localStorage.removeItem(storageKey) } catch { /* 忽略 */ }
    hydratedRef.current = null
    hasHydratedOnce.current = false
  }, [clear, storageKey])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('nodeType') as 'llm' | 'tool' | 'condition' | 'rag'
    const toolName = e.dataTransfer.getData('toolName') || undefined
    if (!type) return
    const rect = e.currentTarget.getBoundingClientRect()
    addNode(type, { x: e.clientX - rect.left - 60, y: e.clientY - rect.top - 20 }, toolName)
  }, [addNode])

  return (
    <div className="app-shell">
      <Toolbar onRun={handleRun} onStop={handleStop} onClear={handleClear} running={running} />
      <CallBanner
        visible={call.dag !== null}
        state={call.state}
        nodeCount={call.dag?.nodes.length ?? 0}
        userInput={call.dag?.userInput ?? ''}
        output={call.output}
      />
      <div className="workspace">
        <NodePalette />
        <div className="canvas-area" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes.map((n) => ({ ...n, data: { ...n.data, status: statusMap[n.id] ?? 'idle' } }))}
            edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onInit={(instance) => { rfRef.current = instance }}
            fitView
          >
            <Background /><Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
          </ReactFlow>
        </div>
        <GenUIPanel events={events} running={running} />
      </div>
    </div>
  )
}
