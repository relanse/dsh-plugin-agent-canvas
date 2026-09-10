import type { NodeType } from '../types'

const NODE_TYPES: Array<{ type: NodeType; label: string; dotColor: string; desc: string }> = [
  { type: 'llm',       label: 'LLM 节点', dotColor: 'var(--color-node-llm)',       desc: 'DeepSeek 对话 + 工具调用' },
  { type: 'tool',      label: '工具节点', dotColor: 'var(--color-node-tool)',      desc: '调用已注册工具' },
  { type: 'condition', label: '条件判断', dotColor: 'var(--color-node-condition)', desc: '根据输出分支' },
  { type: 'rag',       label: 'RAG 节点', dotColor: 'var(--color-node-rag)',       desc: '向量检索召回' },
]

export function NodePalette() {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, type: NodeType) => {
    e.dataTransfer.setData('nodeType', type)
    e.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <aside className="node-palette">
      <p className="node-palette__heading">节点</p>
      {NODE_TYPES.map(({ type, label, dotColor, desc }) => (
        <div key={type} className="palette-item" draggable
          onDragStart={(e) => handleDragStart(e, type)} title={desc}>
          <span className="palette-item__dot" style={{ background: dotColor }} />
          {label}
        </div>
      ))}
    </aside>
  )
}
