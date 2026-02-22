import { useState, useRef, useEffect } from 'react';
import { useServer } from '../../hooks/useServer.js';

export default function ServerSwitcher() {
  const { servers, activeServer, setActiveServerId } = useServer();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!activeServer && servers.length === 0) {
    return (
      <div className="server-switcher">
        <button className="server-switcher-btn" disabled style={{ color: 'var(--dim)' }}>
          No servers ▾
        </button>
      </div>
    );
  }

  return (
    <div className="server-switcher" ref={ref}>
      <button className="server-switcher-btn" onClick={() => setOpen(o => !o)}>
        {activeServer?.name ?? 'Select server'} ▾
      </button>
      {open && (
        <div className="server-dropdown">
          {servers.map(s => (
            <div
              key={s.id}
              className={`server-dropdown-item${s.id === activeServer?.id ? ' active' : ''}`}
              onClick={() => { setActiveServerId(s.id); setOpen(false); }}
            >
              <div>
                <div style={{ fontWeight: 500, color: 'var(--text-bright)', fontSize: '12px' }}>{s.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--dim)', marginTop: '2px' }}>
                  {s.mode} · :{s.gamePort}
                </div>
              </div>
              <span className={`pill ${s.running ? 'pill-green' : 'pill-muted'}`} style={{ fontSize: '10px' }}>
                {s.running ? 'Online' : 'Offline'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
