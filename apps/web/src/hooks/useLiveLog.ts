import { useState, useEffect } from 'react'

export type LogLine = { id: number; raw: string; ts: number }

let lineId = 0

// Subscribes to the live log WebSocket for a given server
export function useLiveLog(serverId: string | null): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([])

  useEffect(() => {
    if (!serverId) return
    setLines([]) // CRITICAL: reset on server switch
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/log/${serverId}`)
    ws.onmessage = (e) => {
      try {
        const { line } = JSON.parse(e.data) as { line: string }
        setLines((prev) => [...prev.slice(-500), { id: lineId++, raw: line, ts: Date.now() }])
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onerror = () => ws.close()
    return () => ws.close()
  }, [serverId])

  return lines
}
