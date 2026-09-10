import { useState, useCallback } from 'react'
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow'
import type { Connection, Edge, EdgeChange, Node, NodeChange } from 'reactflow'
import { t } from '../i18n'
import type { NodeData, NodeType } from '../types'

/** reactflow 画布节点：业务数据 NodeData 挂在 data 上，nodeType 冗余存一份便于序列化 */
type CanvasNode = Node<NodeData>

let nodeCounter = 0

/** 新节点默认 data。label / 提示词走 i18n 词表，取当前语言 */
function defaultsFor(type: NodeType, toolName?: string): NodeData {
  switch (type) {
    case 'llm':
      return {
        nodeType: 'llm',
        label: t('node.llmTitle'),
        model: 'deepseek-chat',
        systemPrompt: t('node.defaultPrompt'),
        temperature: 0.7,
        maxSteps: 20,
      }
    case 'tool':
      return {
        nodeType: 'tool',
        label: toolName ?? t('node.toolTitle'),
        toolName: toolName ?? '',
        staticArgs: {},
      }
    case 'condition':
      return { nodeType: 'condition', label: t('node.conditionTitle'), condition: 'len > 100' }
    case 'rag':
      return {
        nodeType: 'rag',
        label: t('node.ragTitle'),
        knowledgeBaseId: '',
        topK: 20,
        rerankTopK: 5,
        threshold: 0.5,
      }
  }
}

export function useDAG() {
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  )
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [],
  )

  const serialize = useCallback(
    (userInput = '') => ({
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.nodeType, data: n.data })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
      userInput,
    }),
    [nodes, edges],
  )

  const addNode = useCallback((type: NodeType, position: { x: number; y: number }, toolName?: string) => {
    nodeCounter++
    const id = `node-${nodeCounter}`
    setNodes((nds) => [...nds, { id, type, position, data: defaultsFor(type, toolName) }])
  }, [])

  const clear = useCallback(() => {
    setNodes([])
    setEdges([])
    nodeCounter = 0
  }, [])

  return { nodes, edges, onNodesChange, onEdgesChange, onConnect, serialize, addNode, clear }
}
