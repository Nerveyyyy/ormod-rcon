import { useState, useEffect } from 'react';

export type LogLine = { raw: string; ts: number };

// Subscribes to the live log WebSocket for a given server
export function useLiveLog(serverId: string | null): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([]);

  useEffect(() => {
    if (!serverId) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/log/${serverId}`);

    ws.onmessage = (e) => {
      const { line } = JSON.parse(e.data) as { line: string };
      setLines(prev => [...prev.slice(-500), { raw: line, ts: Date.now() }]);
    };

    return () => ws.close();
  }, [serverId]);

  return lines;
}
