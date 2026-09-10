import { useI18n } from '../../i18n'
import type { SSEEvent, ToolCallPayload, ToolResultPayload, ToolErrorPayload } from '../../types'
import { LLMStreamCard } from './LLMStreamCard'
import { ToolCallCard } from './ToolCallCard'
import { ErrorCard } from './ErrorCard'
import './GenUIPanel.css'

function NodeStartBadge({ payload }: { payload: unknown }) {
  const p = payload as { nodeLabel?: string; nodeType?: string }
  return (
    <div className="event event--node-start">
      <span className="event__icon">▶</span>
      <span className="event__label">{p?.nodeLabel}</span>
      <span className="event__badge">{p?.nodeType}</span>
    </div>
  )
}

function NodeDoneBadge({ payload }: { payload: unknown }) {
  const { t } = useI18n()
  const p = payload as { durationMs?: number }
  return (
    <div className="event event--node-done">
      <span className="event__icon">✓</span>
      <span className="event__label">{t('genui.done')}</span>
      <span className="event__muted">{p?.durationMs}ms</span>
    </div>
  )
}

function WorkflowStatusBar({ events, running }: { events: SSEEvent[]; running: boolean }) {
  const { t } = useI18n()
  const doneEvent = [...events].reverse().find((e) => e.type === 'workflow_done')
  const errorEvent = [...events].reverse().find((e) => e.type === 'workflow_error')
  const status = running ? 'running' : doneEvent ? 'done' : errorEvent ? 'error' : 'idle'
  const donePayload = doneEvent?.payload as { totalDurationMs?: number } | undefined
  const errorPayload = errorEvent?.payload as { error?: string } | undefined
  return (
    <div className={`status-bar status-bar--${status}`}>
      <span className="status-bar__dot" />
      <span className="status-bar__text">
        {status === 'idle' && t('genui.statusIdle')}
        {status === 'running' && t('genui.statusRunning')}
        {status === 'done' && t('genui.statusDone', { ms: donePayload?.totalDurationMs ?? 0 })}
        {status === 'error' && t('genui.statusError', { error: errorPayload?.error ?? '' })}
      </span>
    </div>
  )
}

// GenUI 核心：按 SSE 事件 type 分发到对应组件——AI 输出驱动 UI 形态而非纯文本拼接
function EventRenderer({ event }: { event: SSEEvent }) {
  const { t } = useI18n()
  switch (event.type) {
    case 'node_start':    return <NodeStartBadge payload={event.payload} />
    case 'node_done':     return <NodeDoneBadge payload={event.payload} />
    case 'llm_chunk':     return <LLMStreamCard chunk={(event.payload as { text: string } | undefined)?.text ?? ''} />
    case 'tool_call':     return <ToolCallCard call={event.payload as ToolCallPayload} />
    case 'tool_result':   return <ToolCallCard result={event.payload as ToolResultPayload} />
    case 'tool_error':    return <ToolCallCard error={event.payload as ToolErrorPayload} />
    case 'node_error':
    case 'workflow_error': return <ErrorCard error={(event.payload as { error?: string } | undefined)?.error ?? t('genui.unknownError')} nodeId={event.nodeId} />
    case 'step_limit_warning': {
      const p = event.payload as { currentStep?: number; maxSteps?: number }
      return <div className="event event--warning">⚠ {t('genui.stepLimitWarning', { current: p?.currentStep ?? 0, max: p?.maxSteps ?? 0 })}</div>
    }
    default: return null
  }
}

export function GenUIPanel({ events, running }: { events: SSEEvent[]; running: boolean }) {
  const { t } = useI18n()
  return (
    <aside className="genui-panel">
      <WorkflowStatusBar events={events} running={running} />
      <div className="genui-panel__stream">
        {events.length === 0 && !running && (
          <div className="genui-panel__empty">{t('genui.emptyHint')}</div>
        )}
        {events.map((event, i) => <EventRenderer key={i} event={event} />)}
      </div>
    </aside>
  )
}
