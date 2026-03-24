import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client.js'

type SettingsMap = Record<string, string | number | boolean>

export function useSettings(serverName: string | null) {
  const [settings, setSettings] = useState<SettingsMap | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!serverName) return
    setLoading(true)
    api
      .get<{ settings: SettingsMap }>(`/servers/${serverName}/settings`)
      .then((data) => {
        setSettings(data.settings ?? null)
      })
      .catch((err) => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false))
  }, [serverName])

  useEffect(() => {
    setSettings(null)
    if (serverName) load()
  }, [serverName, load])

  return { settings, loading, refresh: load }
}