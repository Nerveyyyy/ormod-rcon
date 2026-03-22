import { useState, useEffect, useCallback, Fragment } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import PlayerPanel from '../components/ui/PlayerPanel.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { api } from '../api/client.js'

interface Player {
  steamId: string
  displayName: string
  online: boolean
  joinedAt: string | null
  totalTime: number
  firstSeen: string
  lastSeen: string
  notes: string | null
  kills: number
  deaths: number
}

export default function Players() {
  const { activeServer } = useServer()

  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'online'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedSteamId, setSelectedSteamId] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, { type: 'ok' | 'err'; message: string }>>({})
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ steamId: string; displayName: string; action: string; label: string } | null>(null)

  const load = useCallback(() => {
    if (!activeServer?.serverName) return
    setLoading(true)
    const params = new URLSearchParams({
      filter,
      page: String(page),
      limit: '50',
    })
    if (search.trim()) params.set('search', search.trim())
    api
      .get<{ data: Player[]; page: number; limit: number; total: number }>(
        `/servers/${activeServer.serverName}/players?${params}`
      )
      .then((res) => {
        setPlayers(res.data)
        setTotal(res.total)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [activeServer?.serverName, filter, page, search])

  useEffect(() => {
    load()
  }, [load])

  // Close panel and reset page on server switch
  useEffect(() => {
    setSelectedSteamId(null)
    setPage(1)
  }, [activeServer?.serverName])

  async function executeAction(reason?: string) {
    if (!confirmAction || !activeServer?.serverName) return
    const { steamId, action, label } = confirmAction
    const key = `${steamId}:${action}`
    setPendingAction(key)
    setConfirmAction(null)
    try {
      const body: Record<string, string> = {}
      if (action === 'kick' && reason) body.reason = reason
      await api.post(`/servers/${activeServer.serverName}/players/${steamId}/${action}`, body)
      setActionStatus((prev) => ({ ...prev, [steamId]: { type: 'ok', message: `${label} succeeded` } }))
      setTimeout(
        () => setActionStatus((prev) => { const n = { ...prev }; delete n[steamId]; return n }),
        3000
      )
    } catch (e) {
      setActionStatus((prev) => ({ ...prev, [steamId]: { type: 'err', message: (e as Error).message } }))
      setTimeout(
        () => setActionStatus((prev) => { const n = { ...prev }; delete n[steamId]; return n }),
        3000
      )
    } finally {
      setPendingAction(null)
    }
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="main fadein">
      <PageHeader
        title="Player Management"
        subtitle="View players, manage permissions, moderate"
        actions={
          <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <input
              className="text-input"
              style={{ width: '200px', fontSize: '11px' }}
              placeholder="Search name or Steam ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button
            className="btn btn-ghost btn-xs"
            style={{ marginLeft: 'auto' }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab${filter === 'all' ? ' active' : ''}`}
          onClick={() => { setFilter('all'); setPage(1) }}
        >
          All Players
        </button>
        <button
          className={`filter-tab${filter === 'online' ? ' active' : ''}`}
          onClick={() => { setFilter('online'); setPage(1) }}
        >
          Online
        </button>
      </div>

      {confirmAction && (
        <ConfirmDialog
          title={`${confirmAction.label} Player`}
          reasonField={confirmAction.action === 'kick'}
          reasonPlaceholder="Kick reason (required)"
          onCancel={() => setConfirmAction(null)}
          onConfirm={executeAction}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Are you sure you want to {confirmAction.label.toLowerCase()}{' '}
            <strong style={{ color: 'var(--text-bright)' }}>{confirmAction.displayName}</strong>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--dim)', marginLeft: '4px' }}>
              ({confirmAction.steamId})
            </span>
            ?
          </div>
        </ConfirmDialog>
      )}

      <div className="card">
        <div className="card-body-0">
          {loading && players.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">Loading...</div>
            </div>
          ) : players.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No players found</div>
              <div className="empty-state-desc">
                {filter === 'online'
                  ? 'No players are currently online.'
                  : search.trim()
                  ? 'No players match your search.'
                  : 'No player records yet.'}
              </div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Steam ID</th>
                  <th>Status</th>
                  <th>Playtime</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const status = actionStatus[p.steamId]
                  return (
                    <Fragment key={p.steamId}>
                      <tr
                        onClick={() => setSelectedSteamId(p.steamId)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="bright">{p.displayName}</td>
                        <td className="mono">{p.steamId}</td>
                        <td>
                          <span
                            className={`pill ${p.online ? 'pill-green' : 'pill-muted'}`}
                            style={{ fontSize: '9px' }}
                          >
                            {p.online ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          {Math.floor(p.totalTime / 3600)}h {Math.floor((p.totalTime % 3600) / 60)}m
                        </td>
                        <td>
                          <div className="btn-group" style={{ gap: '4px', flexWrap: 'nowrap' }}>
                            <button
                              className="btn btn-ghost btn-xs"
                              disabled={pendingAction !== null}
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmAction({ steamId: p.steamId, displayName: p.displayName, action: 'heal', label: 'Heal' })
                              }}
                            >
                              Heal
                            </button>
                            <button
                              className="btn btn-ghost btn-xs"
                              disabled={pendingAction !== null}
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmAction({ steamId: p.steamId, displayName: p.displayName, action: 'kill', label: 'Kill' })
                              }}
                              style={{ color: 'var(--red)' }}
                            >
                              Kill
                            </button>
                            <button
                              className="btn btn-ghost btn-xs"
                              disabled={pendingAction !== null}
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmAction({ steamId: p.steamId, displayName: p.displayName, action: 'kick', label: 'Kick' })
                              }}
                              style={{ color: 'var(--orange)' }}
                            >
                              Kick
                            </button>
                          </div>
                        </td>
                      </tr>
                      {status && (
                        <tr key={`status-${p.steamId}`}>
                          <td
                            colSpan={5}
                            style={{ padding: '4px 16px', background: 'var(--bg2)' }}
                          >
                            <span
                              className={status.type === 'ok' ? 'info-banner' : 'error-banner'}
                              style={{ fontSize: '11px', display: 'inline-block', padding: '4px 10px' }}
                              role="status"
                            >
                              {status.message}
                            </span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}

          {total > 50 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px' }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--muted)',
                  alignSelf: 'center',
                }}
              >
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedSteamId && activeServer?.serverName && (
        <PlayerPanel
          steamId={selectedSteamId}
          serverName={activeServer.serverName}
          online={players.find((p) => p.steamId === selectedSteamId)?.online}
          onClose={() => setSelectedSteamId(null)}
        />
      )}
    </div>
  )
}
