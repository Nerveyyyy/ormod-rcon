import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { api } from '../api/client.js'

export type Server = {
  id: string
  name: string
  serverName: string
  containerName: string | null // Docker container name (null = uses env default)
  mode: string // DOCKER | RCON
  gamePort: number
  queryPort: number
  running: boolean
  notes?: string | null
}

type ServerContextValue = {
  servers: Server[]
  activeServer: Server | null
  setActiveServerId: (id: string) => void
  refresh: () => void
  loading: boolean
}

const ServerContext = createContext<ServerContextValue>({
  servers: [],
  activeServer: null,
  setActiveServerId: () => {},
  refresh: () => {},
  loading: false,
})

export function ServerProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<Server[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    api
      .get<Server[]>('/servers')
      .then((data) => {
        setServers(data)
        setActiveId((prev) => prev ?? data[0]?.id ?? null)
      })
      .catch((err) => console.error('Failed to load servers:', err))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  useEffect(() => load(), [load])

  const activeServer = servers.find((s) => s.id === activeId) ?? null

  const value = useMemo(
    () => ({
      servers,
      activeServer,
      setActiveServerId: setActiveId,
      refresh: load,
      loading,
    }),
    [servers, activeServer, load, loading]
  )

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  )
}

export function useServerContext() {
  return useContext(ServerContext)
}
