import { Handle, Position } from 'reactflow'
import { useI18n } from '../../../i18n'
import type { NodeStatus } from '../../../types'

interface RAGNodeData { label?: string; status?: NodeStatus; knowledgeBaseId?: string; topK?: number; rerankTopK?: number }
const STATUS_ICON: Partial<Record<NodeStatus, string>> = { pending: '○', running: '◎', done: '✓', error: '✕', skipped: '–' }

export function RAGNode({ data }: { data: RAGNodeData }) {
  const { t } = useI18n()
  const status = data.status ?? 'idle'
  return (
    <div className={`rf-node rf-node--rag status--${status}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rf-node__header">
        <span className="rf-node__dot" />
        <span className="rf-node__title">{data.label ?? t('node.ragTitle')}</span>
        {status !== 'idle' && STATUS_ICON[status] && <span className="rf-node__status-icon">{STATUS_ICON[status]}</span>}
      </div>
      <div className="rf-node__body">
        <div className="rf-node__field">{t('node.knowledgeBase')}</div>
        <div className="rf-node__value">
          {data.knowledgeBaseId || <span style={{ color: 'var(--color-muted)' }}>{t('node.notConfigured')}</span>}
        </div>
        <div className="rf-node__field" style={{ marginTop: 6 }}>{t('node.recallRerank')}</div>
        <div className="rf-node__value">{data.topK ?? 20} → {data.rerankTopK ?? 5}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
