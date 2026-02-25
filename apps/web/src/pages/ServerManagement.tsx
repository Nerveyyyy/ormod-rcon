import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import { useServer } from '../hooks/useServer.js';
import type { Server } from '../context/ServerContext.js';
import { api } from '../api/client.js';

export default function ServerManagement() {
  const { servers, refresh } = useServer();
  const [showAdd,       setShowAdd]       = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<Server | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Add form state
  const [name,       setName]       = useState('');
  const [serverName, setServerName] = useState('');
  const [savePath,   setSavePath]   = useState('');
  const [execPath,   setExecPath]   = useState('');
  const [gamePort,   setGamePort]   = useState('27015');
  const [queryPort,  setQueryPort]  = useState('27016');
  const [notes,      setNotes]      = useState('');

  const doAction = async (serverId: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(`${serverId}-${action}`);
    try {
      await api.post(`/servers/${serverId}/${action}`);
      // Brief delay — let Docker update container state before refreshing
      setTimeout(refresh, 800);
    } catch (e) {
      alert(`Action failed: ${(e as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const addServer = async () => {
    if (!name.trim()) return;
    try {
      await api.post('/servers', {
        name,
        serverName,
        savePath,
        containerName: execPath || null,  // null = use GAME_CONTAINER_NAME env default
        gamePort:  parseInt(gamePort,  10),
        queryPort: parseInt(queryPort, 10),
        notes:     notes || null,
      });
      setShowAdd(false);
      setName(''); setServerName(''); setSavePath(''); setExecPath('');
      setGamePort('27015'); setQueryPort('27016'); setNotes('');
      refresh();
    } catch (e) {
      alert(`Failed to add server: ${(e as Error).message}`);
    }
  };

  const deleteServer = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/servers/${deleteTarget.id}`);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="main fadein">
      <PageHeader
        title="Server Management"
        subtitle="Add, configure, and control ORMOD: Directive server processes"
        actions={<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Server</button>}
      />

      {/* ── Add Server Modal ─────────────────────────────────── */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal fadein" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="card-header">
              <span className="card-title">Add Server</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Display Name</div>
                  <div className="setting-desc">Shown in the dashboard UI and switcher</div>
                </div>
                <input className="text-input" value={name} onChange={e => setName(e.target.value)} placeholder="My PvE Server" />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Server Name</div>
                  <div className="setting-desc">Passed as -servername launch flag</div>
                </div>
                <input className="text-input" value={serverName} onChange={e => setServerName(e.target.value)} placeholder="MySurvivalWorld" />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Container Name</div>
                  <div className="setting-desc">Docker container running this server (leave blank to use GAME_CONTAINER_NAME env)</div>
                </div>
                <input className="text-input" value={execPath} onChange={e => setExecPath(e.target.value)}
                  placeholder="ormod-game" style={{ width: '300px' }} />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Save Path</div>
                  <div className="setting-desc">Path inside the dashboard container, e.g. /saves/MySurvivalWorld</div>
                </div>
                <input className="text-input" value={savePath} onChange={e => setSavePath(e.target.value)}
                  placeholder="/saves/MySurvivalWorld" style={{ width: '300px' }} />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Game Port (UDP)</div></div>
                <input className="num-input" type="number" value={gamePort} onChange={e => setGamePort(e.target.value)} />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Query Port (UDP)</div></div>
                <input className="num-input" type="number" value={queryPort} onChange={e => setQueryPort(e.target.value)} />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Notes</div></div>
                <input className="text-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={addServer} disabled={!name.trim()}>
                  Add Server
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Server"
          confirmWord={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteServer}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
            This will remove <strong style={{ color: 'var(--orange)' }}>{deleteTarget.name}</strong> from the dashboard.
            Server files on disk will <strong>not</strong> be deleted.
          </div>
        </ConfirmDialog>
      )}

      {/* ── Server cards ─────────────────────────────────────── */}
      {servers.length === 0 ? (
        <div className="card">
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
            No servers configured. Click "+ Add Server" to get started.
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: '12px' }}>
          {servers.map(server => {
            const isActing = actionLoading?.startsWith(server.id) ?? false;
            return (
              <div key={server.id} className="card">
                <div className="card-header">
                  <div className="row">
                    <span className="card-title">{server.name}</span>
                    <span className={`pill ${server.running ? 'pill-green' : 'pill-muted'}`}>
                      {server.running && <span className="dot dot-green pulse" />}
                      {server.running ? 'Running' : 'Stopped'}
                    </span>
                    <div className="spacer" />
                    <button
                      className="btn btn-green btn-sm"
                      disabled={isActing || server.running}
                      onClick={() => doAction(server.id, 'start')}
                    >
                      {actionLoading === `${server.id}-start` ? 'Starting…' : 'Start'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={isActing || !server.running}
                      onClick={() => doAction(server.id, 'stop')}
                    >
                      {actionLoading === `${server.id}-stop` ? 'Stopping…' : 'Stop'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={isActing}
                      onClick={() => doAction(server.id, 'restart')}
                    >
                      {actionLoading === `${server.id}-restart` ? 'Restarting…' : 'Restart'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(server)}>Delete</button>
                  </div>
                </div>
                <div className="card-body-0">
                  {([
                    ['Server Name',  server.serverName],
                    ['Container',    server.containerName || server.executablePath || '(default from env)'],
                    ['Save Path',    server.savePath      || '— not set'],
                    ['Game Port',    `${server.gamePort} (UDP)`],
                    ['Query Port',   `${server.queryPort} (UDP)`],
                    ['Notes',        server.notes         ?? '—'],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="setting-row">
                      <span className="setting-key" style={{ minWidth: '100px' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: v.startsWith('—') ? 'var(--dim)' : 'var(--text)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
