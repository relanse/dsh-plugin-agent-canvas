import { useState, useCallback } from 'react'
import type { NodeStatus, SSEEvent } from '../types'

const TRANSITIONS: Partial<Record<string, NodeStatus>> = {
  node_start: 'running',
  node_done: 'done',
  node_error: 'error',
  node_skipped: 'skipped',
}

export function useNodeStatus() {
  const [statusMap, setStatusMap] = useState<Record<string, NodeStatus>>({})

  const reset = useCallback((nodeIds: string[]) => {
    const initial = Object.fromEntries(nodeIds.map((id) => [id, 'pending' as const]))
    setStatusMap(initial)
  }, [])

  const handleEvent = useCallback((event: SSEEvent) => {
    const next = TRANSITIONS[event.type]
    if (next && event.nodeId) {
      setStatusMap((prev) => ({ ...prev, [event.nodeId as string]: next }))
    }
  }, [])

  return { statusMap, reset, handleEvent }
}
