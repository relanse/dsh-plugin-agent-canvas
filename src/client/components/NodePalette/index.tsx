import { useI18n, type MessageKey } from '../../i18n'
import type { NodeType } from '../../types'

/** 词表 key 与 NodeType 同构：palette.llm.label / palette.tool.desc … */
const NODE_TYPES: Array<{ type: NodeType; dotColor: string }> = [
  { type: 'llm',       dotColor: 'var(--color-node-llm)' },
  { type: 'tool',      dotColor: 'var(--color-node-tool)' },
  { type: 'condition', dotColor: 'var(--color-node-condition)' },
  { type: 'rag',       dotColor: 'var(--color-node-rag)' },
]

export function NodePalette() {
  const { t } = useI18n()
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, type: NodeType) => {
    e.dataTransfer.setData('nodeType', type)
    e.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <aside className="node-palette">
      <p className="node-palette__heading">{t('palette.heading')}</p>
      {NODE_TYPES.map(({ type, dotColor }) => (
        <div key={type} className="palette-item" draggable
          onDragStart={(e) => handleDragStart(e, type)} title={t(`palette.${type}.desc` as MessageKey)}>
          <span className="palette-item__dot" style={{ background: dotColor }} />
          {t(`palette.${type}.label` as MessageKey)}
        </div>
      ))}
    </aside>
  )
}
