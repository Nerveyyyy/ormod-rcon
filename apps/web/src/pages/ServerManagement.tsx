import { useState, useEffect, useRef } from 'react'

function toServerName(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
import PageHeader from '../components/ui/PageHeader.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import type { Server } from '../context/ServerContext.js'
import { api } from '../api/client.js'

export default function ServerManagement() {
  const { servers, refresh } = useServer()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  // Add form state
  const [name, setName] = useState('')
  const [serverName, setServerName] = useState('')
  const [containerName, setContainerName] = useState('')
  const [gamePort, setGamePort] = useState('27015')
  const [queryPort, setQueryPort] = useState('27016')
  const [notes, setNotes] = useState('')

  const closeAddModal = () => {
    setShowAdd(false)
    setName('')
    setServerName('')
    setContainerName('')
    setGamePort('27015')
    setQueryPort('27016')
    setNotes('')
  }

  const doAction = async (sn: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(`${sn}-${action}`)
    try {
      await api.post(`/servers/${sn}/${action}`)
      // Brief delay — let Docker update container state before refreshing
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        refresh()
      }, 800)
    } catch (e) {
      alert(`Action failed: ${(e as Error).message}`)
    } finally {
      setActionLoading(null)
    }
  }

  const addServer = async () => {
    if (!name.trim()) return
    try {
      await api.post('/servers', {
        name,
        serverName: serverName,
        containerName: containerName || null, // null = use GAME_CONTAINER_NAME env default
        gamePort: parseInt(gamePort, 10),
        queryPort: parseInt(queryPort, 10),
        notes: notes || null,
      })
      closeAddModal()
      refresh()
    } catch (e) {
      alert(`Failed to add server: ${(e as Error).message}`)
    }
  }

  const deleteServer = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/servers/${deleteTarget.serverName}`)
      setDeleteTarget(null)
      refresh()
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="main fadein">
      <PageHeader
        title="Server Management"
        subtitle="Add, configure, and control ORMOD: Directive server processes"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Add Server
          </button>
        }
      />

      {/* ── Add Server Modal ─────────────────────────────────── */}
      {showAdd && (
        <div className="overlay" onClick={closeAddModal}>
          <div
            className="modal fadein"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '560px' }}
          >
            <div className="card-header">
              <span className="card-title">Add Server</span>
              <button className="btn btn-ghost btn-xs" onClick={closeAddModal}>
                ✕
              </button>
            </div>
            <div
              className="card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Display Name</div>
                  <div className="setting-desc">Shown in the dashboard UI and switcher</div>
                </div>
                <input
                  className="text-input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setServerName(toServerName(e.target.value))
                  }}
                  placeholder="My PvE Server"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Server Name</div>
                  <div className="setting-desc">URL-safe identifier used in API routes (auto-derived)</div>
                </div>
                <input
                  className="text-input"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="my-pve-server"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Container Name</div>
                  <div className="setting-desc">
                    Docker container running this server (leave blank to use GAME_CONTAINER_NAME
                    env)
                  </div>
                </div>
                <input
                  className="text-input"
                  value={containerName}
                  onChange={(e) => setContainerName(e.target.value)}
                  placeholder="ormod-server"
                  style={{ width: '300px' }}
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Game Port (UDP)</div>
                </div>
                <input
                  className="num-input"
                  type="number"
                  value={gamePort}
                  onChange={(e) => setGamePort(e.target.value)}
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Query Port (UDP)</div>
                </div>
                <input
                  className="num-input"
                  type="number"
                  value={queryPort}
                  onChange={(e) => setQueryPort(e.target.value)}
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Notes</div>
                </div>
                <input
                  className="text-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={closeAddModal}>
                  Cancel
                </button>
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
            This will remove <strong style={{ color: 'var(--orange)' }}>{deleteTarget.name}</strong>{' '}
            from the dashboard. Server files on disk will <strong>not</strong> be deleted.
          </div>
        </ConfirmDialog>
      )}

      {/* ── Server cards ─────────────────────────────────────── */}
      {servers.length === 0 ? (
        <div className="card">
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: 'var(--dim)',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
            }}
          >
            No servers configured. Click &quot;+ Add Server&quot; to get started.
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: '12px' }}>
          {servers.map((server) => {
            const isActing = actionLoading?.startsWith(server.serverName) ?? false
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
                      onClick={() => doAction(server.serverName, 'start')}
                    >
                      {actionLoading === `${server.serverName}-start` ? 'Starting…' : 'Start'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={isActing || !server.running}
                      onClick={() => doAction(server.serverName, 'stop')}
                    >
                      {actionLoading === `${server.serverName}-stop` ? 'Stopping…' : 'Stop'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={isActing}
                      onClick={() => doAction(server.serverName, 'restart')}
                    >
                      {actionLoading === `${server.serverName}-restart` ? 'Restarting…' : 'Restart'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTarget(server)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="card-body-0">
                  {(
                    [
                      ['Server Name', server.serverName],
                      ['Container', server.containerName ?? '(default from env)'],
                      ['Game Port', `${server.gamePort} (UDP)`],
                      ['Query Port', `${server.queryPort} (UDP)`],
                      ['Notes', server.notes ?? '—'],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className="setting-row">
                      <span className="setting-key" style={{ minWidth: '100px' }}>
                        {k}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: '11px',
                          color: v.startsWith('—') ? 'var(--dim)' : 'var(--text)',
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
