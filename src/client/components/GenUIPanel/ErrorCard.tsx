import { useI18n } from '../../i18n'

export function ErrorCard({ error, nodeId }: { error: string; nodeId?: string }) {
  const { t } = useI18n()
  return (
    <div className="error-card">
      <div className="error-card__header">
        <span className="error-card__icon">🚨</span>
        <span className="error-card__label">
          {nodeId ? t('genui.nodeFailed', { nodeId }) : t('genui.workflowError')}
        </span>
      </div>
      <p className="error-card__message">{error}</p>
    </div>
  )
}
