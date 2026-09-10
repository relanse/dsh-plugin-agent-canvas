import { useRef, useEffect } from 'react'
import { useI18n } from '../../i18n'

// DOM 直接追加 chunk，绕过大量 React 状态更新导致的重渲染性能问题。
export function LLMStreamCard({ chunk }: { chunk: string }) {
  const { t } = useI18n()
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (!ref.current || !chunk) return
    ref.current.textContent += chunk
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chunk])
  return (
    <div className="llm-stream-card">
      <div className="llm-stream-card__header">
        <span className="llm-stream-card__icon">🤖</span>
        <span className="llm-stream-card__label">{t('genui.llmOutput')}</span>
      </div>
      <pre ref={ref} className="llm-stream-card__text" />
    </div>
  )
}
