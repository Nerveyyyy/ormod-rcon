import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../api/client.js';

export type Server = {
  id: string;
  name: string;
  serverName: string;
  savePath: string;
  containerName: string | null;  // Docker container name (null = uses env default)
  executablePath: string;        // Legacy field — prefer containerName
  mode: string;                  // DOCKER | RCON
  gamePort: number;
  queryPort: number;
  running: boolean;
  notes?: string | null;
};

type ServerContextValue = {
  servers: Server[];
  activeServer: Server | null;
  setActiveServerId: (id: string) => void;
  refresh: () => void;
  loading: boolean;
};

const ServerContext = createContext<ServerContextValue>({
  servers: [],
  activeServer: null,
  setActiveServerId: () => {},
  refresh: () => {},
  loading: false,
});

export function ServerProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<Server[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<Server[]>('/servers')
      .then(data => {
        setServers(data);
        setActiveId(prev => prev ?? data[0]?.id ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const activeServer = servers.find(s => s.id === activeId) ?? null;

  return (
    <ServerContext.Provider value={{
      servers,
      activeServer,
      setActiveServerId: setActiveId,
      refresh: load,
      loading,
    }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServerContext() {
  return useContext(ServerContext);
}
