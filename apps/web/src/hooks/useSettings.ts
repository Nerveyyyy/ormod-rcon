import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client.js'

function tryParseSettings(raw: string): Record<string, unknown> | null {
  // Attempt JSON first
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  // Attempt line-by-line key=value or key: value
  const result: Record<string, unknown> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*[=:]\s*(.+)$/)
    if (!m || !m[1] || !m[2]) continue
    const val = m[2].trim().replace(/^["']|["']$/g, '')
    if (val === 'true') result[m[1]] = true
    else if (val === 'false') result[m[1]] = false
    else if (val !== '' && !isNaN(Number(val))) result[m[1]] = Number(val)
    else result[m[1]] = val
  }
  return Object.keys(result).length > 0 ? result : null
}

export function useSettings(serverId: string | null) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!serverId) return
    setLoading(true)
    api
      .get<{ raw?: string } | Record<string, unknown>>(`/servers/${serverId}/settings`)
      .then((data) => {
        if (data && typeof data === 'object' && 'raw' in data && typeof data.raw === 'string') {
          setRaw(data.raw)
          setSettings(tryParseSettings(data.raw))
        } else {
          // Future: backend returns a parsed object directly
          setSettings(data as Record<string, unknown>)
          setRaw(null)
        }
      })
      .catch((err) => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false))
  }, [serverId])

  useEffect(() => {
    setSettings(null)
    setRaw(null)
    if (serverId) load()
  }, [serverId, load])

  return { settings, raw, loading, refresh: load }
}
