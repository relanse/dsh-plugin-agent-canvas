import type { WireEdge, WireNode } from '../types/toolview'

/**
 * 分层自动布局：AI 提交的线协议节点没有画布坐标，按最长路径分层
 * （Kahn 深度的松弛实现，环存在时以迭代上限兜底），同层纵向排开。
 * 与 Go 端 TopologicalSort 同构的只是"深度"概念——这里不求全序，只求分层。
 */
export function layeredLayout(
  nodes: readonly WireNode[],
  edges: readonly WireEdge[],
): Map<string, { x: number; y: number }> {
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]))

  // 最长路径松弛：target 深度至少是 source 深度 + 1
  for (let iter = 0; iter < nodes.length; iter++) {
    let changed = false
    for (const e of edges) {
      if (!depth.has(e.source) || !depth.has(e.target)) continue
      const want = (depth.get(e.source) ?? 0) + 1
      if (want > (depth.get(e.target) ?? 0)) {
        depth.set(e.target, want)
        changed = true
      }
    }
    if (!changed) break
  }

  const layers = new Map<number, string[]>()
  for (const [id, d] of depth) {
    const layer = layers.get(d) ?? []
    layer.push(id)
    layers.set(d, layer)
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const [d, ids] of layers) {
    ids.forEach((id, i) => {
      positions.set(id, { x: 60 + d * 260, y: 60 + i * 130 })
    })
  }
  return positions
}
