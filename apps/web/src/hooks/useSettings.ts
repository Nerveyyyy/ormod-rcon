import { useState, useEffect } from 'react'
import { api } from '../api/client.js'

// Fetches and manages serversettings.json for the active server
export function useSettings(serverId: string | null) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!serverId) return
    setLoading(true)
    api
      .get<Record<string, unknown>>(`/servers/${serverId}/settings`)
      .then(setSettings)
      .catch((err) => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false))
  }, [serverId])

  return { settings, loading }
}
