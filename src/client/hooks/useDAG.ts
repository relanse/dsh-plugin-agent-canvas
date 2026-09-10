import { useState, useCallback } from 'react'
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow'
import type { Connection, Edge, EdgeChange, Node, NodeChange } from 'reactflow'
import { t } from '../i18n'
import { layeredLayout } from '../utils/layout'
import type { WireDAG } from '../types/toolview'
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

  /**
   * 导入 AI 调用提交的线协议 DAG：wire 节点没有画布坐标，按分层布局落位；
   * data 缺字段时用该类型默认值兜底，保证任意来源的节点都能渲染。
   */
  const loadWire = useCallback((dag: WireDAG) => {
    const positions = layeredLayout(dag.nodes, dag.edges)
    const known: readonly string[] = ['llm', 'tool', 'condition', 'rag']
    setNodes(
      dag.nodes.map((n, i) => {
        const type = (known.includes(n.type) ? n.type : 'tool') as NodeType
        const base = defaultsFor(type)
        const wire = (n.data ?? {}) as Partial<NodeData>
        return {
          id: n.id,
          type,
          position: positions.get(n.id) ?? { x: 60, y: 60 + i * 130 },
          data: {
            ...base,
            ...wire,
            nodeType: type,
            label: typeof wire.label === 'string' && wire.label !== '' ? wire.label : base.label,
          },
        }
      }),
    )
    setEdges(
      dag.edges.map((e, i) => ({
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        animated: true,
      })),
    )
  }, [])

  return { nodes, edges, onNodesChange, onEdgesChange, onConnect, serialize, addNode, clear, loadWire }
}
