import { Handle, Position } from 'reactflow'
import type { NodeStatus } from '../../types'

interface RAGNodeData { label?: string; status?: NodeStatus; knowledgeBaseId?: string; topK?: number; rerankTopK?: number }
const STATUS_ICON: Partial<Record<NodeStatus, string>> = { pending: '○', running: '◎', done: '✓', error: '✕', skipped: '–' }

export function RAGNode({ data }: { data: RAGNodeData }) {
  const status = data.status ?? 'idle'
  return (
    <div className={`rf-node rf-node--rag status--${status}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rf-node__header">
        <span className="rf-node__dot" />
        <span className="rf-node__title">{data.label ?? 'RAG 节点'}</span>
        {status !== 'idle' && STATUS_ICON[status] && <span className="rf-node__status-icon">{STATUS_ICON[status]}</span>}
      </div>
      <div className="rf-node__body">
        <div className="rf-node__field">知识库</div>
        <div className="rf-node__value">{data.knowledgeBaseId ?? <span style={{ color: 'var(--color-muted)' }}>未配置</span>}</div>
        <div className="rf-node__field" style={{ marginTop: 6 }}>召回 / 重排</div>
        <div className="rf-node__value">{data.topK ?? 20} → {data.rerankTopK ?? 5}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
