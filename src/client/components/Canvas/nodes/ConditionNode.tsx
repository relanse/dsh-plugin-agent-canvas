import { Handle, Position } from 'reactflow'
import type { NodeStatus } from '../../types'

interface ConditionNodeData { label?: string; status?: NodeStatus; condition?: string }
const STATUS_ICON: Partial<Record<NodeStatus, string>> = { pending: '○', running: '◎', done: '✓', error: '✕', skipped: '–' }

export function ConditionNode({ data }: { data: ConditionNodeData }) {
  const status = data.status ?? 'idle'
  return (
    <div className={`rf-node rf-node--condition status--${status}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rf-node__header">
        <span className="rf-node__dot" />
        <span className="rf-node__title">{data.label ?? '条件判断'}</span>
        {status !== 'idle' && STATUS_ICON[status] && <span className="rf-node__status-icon">{STATUS_ICON[status]}</span>}
      </div>
      <div className="rf-node__body">
        <div className="rf-node__field">条件表达式</div>
        <div className="rf-node__value" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{data.condition ?? 'len > 100'}</div>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} />
    </div>
  )
}
