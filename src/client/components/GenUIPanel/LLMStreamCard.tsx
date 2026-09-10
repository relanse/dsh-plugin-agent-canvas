import { useI18n } from '../../i18n'

/** 单个 LLM 节点的流式输出卡片：接收该节点已累计的全量文本（由面板层合并 chunk） */
export function LLMStreamCard({ text, nodeId }: { text: string; nodeId?: string }) {
  const { t } = useI18n()
  return (
    <div className="llm-stream-card">
      <div className="llm-stream-card__header">
        <span className="llm-stream-card__icon">🤖</span>
        <span className="llm-stream-card__label">{t('genui.llmOutput')}</span>
        {nodeId !== undefined && <span className="llm-stream-card__node">{nodeId}</span>}
      </div>
      <pre className="llm-stream-card__text">{text}</pre>
    </div>
  )
}
