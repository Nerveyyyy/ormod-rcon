import { useState, useEffect } from 'react'

export type ActivityEvent = {
  id: string
  type: string
  timestamp: string
  displayName: string | null
  steamId: string | null
  detail: string
  source: string | null
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

export function useActivityFeed(serverName: string | null): {
  events: ActivityEvent[]
  status: WsStatus
} {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [status, setStatus] = useState<WsStatus>('disconnected')

  useEffect(() => {
    if (!serverName) return
    setEvents([])
    setStatus('connecting')

    let reconnectDelay = 1000
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let ws: WebSocket | null = null
    let cancelled = false

    function connect() {
      if (cancelled) return
      setStatus('connecting')
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}/ws/activity/${serverName}`)

      ws.onopen = () => {
        reconnectDelay = 1000
        setStatus('connected')
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as {
            type: 'init' | 'update'
            events: ActivityEvent[]
          }
          if (msg.type === 'init') {
            setEvents(msg.events)
          } else if (msg.type === 'update') {
            setEvents((prev) => {
              const existingIds = new Set(prev.map((e) => e.id))
              const newEvents = msg.events.filter((e) => !existingIds.has(e.id))
              if (newEvents.length === 0) return prev
              return [...newEvents, ...prev].slice(0, 100)
            })
          }
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
  }, [serverName])

  return { events, status }
}
