import { Handle, Position } from 'reactflow'
import { useI18n } from '../../../i18n'
import type { NodeStatus } from '../../../types'

interface ToolNodeData { label?: string; status?: NodeStatus; toolName?: string }
const STATUS_ICON: Partial<Record<NodeStatus, string>> = { pending: '○', running: '◎', done: '✓', error: '✕', skipped: '–' }

export function ToolNode({ data }: { data: ToolNodeData }) {
  const { t } = useI18n()
  const status = data.status ?? 'idle'
  return (
    <div className={`rf-node rf-node--tool status--${status}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rf-node__header">
        <span className="rf-node__dot" />
        <span className="rf-node__title">{data.label ?? t('node.toolTitle')}</span>
        {status !== 'idle' && STATUS_ICON[status] && <span className="rf-node__status-icon">{STATUS_ICON[status]}</span>}
      </div>
      <div className="rf-node__body">
        <div className="rf-node__field">{t('node.tool')}</div>
        <div className="rf-node__value">
          {data.toolName || <span style={{ color: 'var(--color-muted)' }}>{t('node.notConfigured')}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
