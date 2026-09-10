import { Handle, Position } from 'reactflow'
import { useI18n } from '../../../i18n'
import type { NodeStatus } from '../../../types'

interface LLMNodeData { label?: string; status?: NodeStatus; model?: string; systemPrompt?: string; maxSteps?: number }
const STATUS_ICON: Partial<Record<NodeStatus, string>> = { pending: '○', running: '◎', done: '✓', error: '✕', skipped: '–' }

export function LLMNode({ data }: { data: LLMNodeData }) {
  const { t } = useI18n()
  const status = data.status ?? 'idle'
  return (
    <div className={`rf-node rf-node--llm status--${status}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rf-node__header">
        <span className="rf-node__dot" />
        <span className="rf-node__title">{data.label ?? t('node.llmTitle')}</span>
        {status !== 'idle' && STATUS_ICON[status] && <span className="rf-node__status-icon">{STATUS_ICON[status]}</span>}
      </div>
      <div className="rf-node__body">
        <div className="rf-node__field">{t('node.model')}</div>
        <div className="rf-node__value">{data.model ?? 'deepseek-chat'}</div>
        {data.systemPrompt && (<>
          <div className="rf-node__field" style={{ marginTop: 6 }}>{t('node.systemPrompt')}</div>
          <div className="rf-node__value" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            {data.systemPrompt.slice(0, 60)}{data.systemPrompt.length > 60 ? '…' : ''}
          </div>
        </>)}
        <div className="rf-node__field" style={{ marginTop: 6 }}>{t('node.maxSteps')}</div>
        <div className="rf-node__value">{data.maxSteps ?? 20}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
