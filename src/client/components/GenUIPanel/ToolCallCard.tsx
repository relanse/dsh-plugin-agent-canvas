import type { ToolCallPayload, ToolResultPayload, ToolErrorPayload } from '../../types'

interface Props { call?: ToolCallPayload; result?: ToolResultPayload; error?: ToolErrorPayload }

export function ToolCallCard({ call, result, error }: Props) {
  if (call) return (
    <div className="tool-card tool-card--calling">
      <div className="tool-card__header">
        <span className="tool-card__icon">🔧</span>
        <span className="tool-card__name">{call.toolName}</span>
        <span className="tool-card__badge">调用中…</span>
      </div>
      <pre className="tool-card__args">{JSON.stringify(call.args, null, 2)}</pre>
    </div>
  )
  if (result) return (
    <div className="tool-card tool-card--done">
      <div className="tool-card__header">
        <span className="tool-card__icon">✅</span>
        <span className="tool-card__name">{result.toolName}</span>
        <span className="tool-card__badge">{result.durationMs}ms</span>
      </div>
      <pre className="tool-card__result">{result.result}</pre>
    </div>
  )
  if (error) return (
    <div className="tool-card tool-card--error">
      <div className="tool-card__header">
        <span className="tool-card__icon">❌</span>
        <span className="tool-card__name">{error.toolName}</span>
        <span className="tool-card__badge">重试 {error.retryCount}</span>
      </div>
      <pre className="tool-card__error">{error.error}</pre>
    </div>
  )
  return null
}
