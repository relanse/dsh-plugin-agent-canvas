export function ErrorCard({ error, nodeId }: { error: string; nodeId?: string }) {
  return (
    <div className="error-card">
      <div className="error-card__header">
        <span className="error-card__icon">🚨</span>
        <span className="error-card__label">{nodeId ? `节点 ${nodeId} 执行失败` : '工作流错误'}</span>
      </div>
      <p className="error-card__message">{error}</p>
    </div>
  )
}
