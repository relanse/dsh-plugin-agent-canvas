import { useRef, useCallback } from 'react'
import type { DAGRequest, SSEEvent } from '../types'

/**
 * fetch 版 SSE 消费者。
 *
 * 为什么不用原生 EventSource：它只支持 GET，而 DAG JSON 必须放进 POST body，
 * 因此用 Streams API 手工解析 `data: ...\n\n` 帧。
 */

// 浏览器侧无 process.env，通过全局变量注入后端地址（宿主页面可覆盖）
const BACKEND_URL =
  (globalThis as { __AGENT_CANVAS_BACKEND__?: string }).__AGENT_CANVAS_BACKEND__ ??
  'http://localhost:8080'

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    async (
      dagRequest: DAGRequest,
      onEvent: (event: SSEEvent) => void,
      onDone: () => void,
      onError: (message: string) => void,
    ) => {
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      try {
        const res = await fetch(`${BACKEND_URL}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dagRequest),
          signal: abortRef.current.signal,
        })

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          onError(body?.error ?? `HTTP ${res.status}`)
          return
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''

          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data: ')) continue
              try {
                const event = JSON.parse(line.slice(6)) as SSEEvent
                onEvent(event)
                if (event.type === 'workflow_done' || event.type === 'workflow_error') {
                  onDone()
                }
              } catch {
                // 忽略畸形帧
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') onError((err as Error).message)
      }
    },
    [],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { start, stop }
}
