import { useState, useEffect } from 'react'

export type LogLine = { lineId: number; raw: string; ts: number }

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

let _lineId = 0

// Subscribes to the live log WebSocket for a given server.
// Reconnects with exponential backoff on server-side close.
export function useLiveLog(serverId: string | null): { lines: LogLine[]; status: WsStatus } {
  const [lines, setLines] = useState<LogLine[]>([])
  const [status, setStatus] = useState<WsStatus>('disconnected')

  useEffect(() => {
    if (!serverId) return
    setLines([]) // CRITICAL: reset on server switch
    setStatus('connecting')

    let reconnectDelay = 1000
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let ws: WebSocket | null = null
    let cancelled = false

    function connect() {
      if (cancelled) return
      setStatus('connecting')
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}/ws/log/${serverId}`)

      ws.onopen = () => {
        reconnectDelay = 1000
        setStatus('connected')
      }

      ws.onmessage = (e) => {
        try {
          const { line } = JSON.parse(e.data) as { line: string }
          setLines((prev) => [
            ...prev.slice(-999),
            { lineId: _lineId++, raw: line, ts: Date.now() },
          ])
        } catch {
          /* ignore malformed frames */
        }
      }

      ws.onerror = () => ws?.close()

      ws.onclose = () => {
        if (cancelled) return
        setStatus('disconnected')
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000)
          connect()
        }, reconnectDelay)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [serverId])

  return { lines, status }
}
