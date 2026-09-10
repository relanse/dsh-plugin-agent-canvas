import { useState, useCallback } from 'react'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import 'reactflow/dist/style.css'
import { Toolbar } from './components/Toolbar'
import { NodePalette } from './components/NodePalette'
import { GenUIPanel } from './components/GenUIPanel'
import { LLMNode } from './components/Canvas/nodes/LLMNode'
import { ToolNode } from './components/Canvas/nodes/ToolNode'
import { ConditionNode } from './components/Canvas/nodes/ConditionNode'
import { RAGNode } from './components/Canvas/nodes/RAGNode'
import { useDAG } from './hooks/useDAG'
import { useNodeStatus } from './hooks/useNodeStatus'
import { useSSE } from './hooks/useSSE'
import type { SSEEvent } from './types'
import './styles/tokens.css'
import './styles/app.css'

const nodeTypes = { llm: LLMNode, tool: ToolNode, condition: ConditionNode, rag: RAGNode } as const

export function AgentCanvasPanel(): JSX.Element {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, serialize, addNode, clear } = useDAG()
  const { statusMap, reset: resetStatus, handleEvent: handleStatusEvent } = useNodeStatus()
  const { start: startSSE, stop: stopSSE } = useSSE()
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<SSEEvent[]>([])

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
      <Toolbar onRun={handleRun} onStop={handleStop} onClear={clear} running={running} />
      <div className="workspace">
        <NodePalette />
        <div className="canvas-area" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes.map((n) => ({ ...n, data: { ...n.data, status: statusMap[n.id] ?? 'idle' } }))}
            edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
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
