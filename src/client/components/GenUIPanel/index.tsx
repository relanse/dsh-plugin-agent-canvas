import { useEffect, useMemo, useRef } from 'react'
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
// （llm_chunk 不在此分发：由 coalesceEvents 合并成流卡片）
function EventRenderer({ event }: { event: SSEEvent }) {
  const { t } = useI18n()
  switch (event.type) {
    case 'node_start':    return <NodeStartBadge payload={event.payload} />
    case 'node_done':     return <NodeDoneBadge payload={event.payload} />
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

type RenderItem =
  | { kind: 'event'; event: SSEEvent }
  | { kind: 'stream'; nodeId?: string; text: string }

/**
 * 把事件流折叠成渲染项：同一节点的连续 llm_chunk 合并成一张流卡片。
 * 逐 chunk 一卡会导致输出碎成逐 token 的小片段（无法阅读），
 * 非流事件打断合并——节点错误后的新输出另起一张卡。
 */
function coalesceEvents(events: SSEEvent[]): RenderItem[] {
  const items: RenderItem[] = []
  let current: { kind: 'stream'; nodeId?: string; text: string } | null = null
  for (const e of events) {
    if (e.type === 'llm_chunk') {
      const text = (e.payload as { text?: string } | undefined)?.text ?? ''
      if (current !== null && current.nodeId === e.nodeId) {
        current.text += text
      } else {
        current = { kind: 'stream', nodeId: e.nodeId, text }
        items.push(current)
      }
    } else {
      current = null
      items.push({ kind: 'event', event: e })
    }
  }
  return items
}

export function GenUIPanel({ events, running }: { events: SSEEvent[]; running: boolean }) {
  const { t } = useI18n()
  const streamRef = useRef<HTMLDivElement>(null)
  const items = useMemo(() => coalesceEvents(events), [events])

  // 容器级自动滚动：新事件到达时贴底（替代逐卡片 scrollIntoView 的抖动）
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  return (
    <aside className="genui-panel">
      <WorkflowStatusBar events={events} running={running} />
      <div className="genui-panel__stream" ref={streamRef}>
        {events.length === 0 && !running && (
          <div className="genui-panel__empty">{t('genui.emptyHint')}</div>
        )}
        {items.map((item, i) =>
          item.kind === 'stream' ? (
            <LLMStreamCard key={`s-${i}`} text={item.text} nodeId={item.nodeId} />
          ) : (
            <EventRenderer key={`e-${i}`} event={item.event} />
          ),
        )}
      </div>
    </aside>
  )
}
