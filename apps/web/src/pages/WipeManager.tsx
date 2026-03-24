import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { api } from '../api/client.js'

type WipeLog = {
  id: string
  triggeredBy: string
  triggeredByName: string | null
  type: string
  targetSteamId: string | null
  createdAt: string
  notes: string | null
  success: boolean
  errorMsg: string | null
}

const wipeTypes = [
  {
    id: 'MAP_ONLY',
    backendType: 'map',
    label: 'Map Wipe',
    color: 'btn-primary',
    icon: '◫',
    desc: 'Deletes all world, chunk, and entity data. Player inventories and stats are preserved. Use for regular wipe days.',
    deletes: [
      'ChunkData/',
      'RegionData/',
      'mapdata.json',
      'entitydata.json',
      'networkentities.json',
      'buildareas.json',
      'structuredata.dat',
      'loottables.json',
      'weatherdata.dat',
      'worldregrowth.json',
    ],
  },
  {
    id: 'MAP_PLAYERS',
    backendType: 'full',
    label: 'Map + Players',
    color: 'btn-ghost',
    icon: '◫',
    desc: 'Deletes world data AND player data. Players lose their inventories and progress. Keeps access lists and settings.',
    deletes: [
      'ChunkData/',
      'RegionData/',
      'PlayerData/',
      'mapdata.json',
      'entitydata.json',
      'networkentities.json',
    ],
  },
  {
    id: 'FULL',
    backendType: 'full',
    label: 'Full Wipe',
    color: 'btn-danger',
    icon: '⊠',
    desc: 'Deletes everything except access lists and server settings. Complete fresh start — use sparingly.',
    deletes: ['ChunkData/', 'RegionData/', 'PlayerData/', 'All world files', 'log.txt'],
  },
  {
    id: 'PLAYER_DATA',
    backendType: 'playerdata',
    label: 'Player Data',
    color: 'btn-ghost',
    icon: '⌬',
    desc: "Wipe a specific player's data by Steam ID, or all player data if no ID is provided.",
    deletes: ['PlayerData/ (targeted or all)'],
  },
]

export default function WipeManager() {
  const { activeServer } = useServer()
  const [tab, setTab] = useState<'quick' | 'history'>('quick')
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingType, setPendingType] = useState<string | null>(null)
  const [wiping, setWiping] = useState(false)
  const [targetSteamId, setTargetSteamId] = useState('')
  const [history, setHistory] = useState<WipeLog[]>([])
  const [wipeNotes, setWipeNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(() => {
    if (!activeServer?.serverName) return
    api
      .get<WipeLog[]>(`/servers/${activeServer.serverName}/wipes`)
      .then(setHistory)
      .catch((e) => setError((e as Error).message || 'Failed to load wipe history'))
  }, [activeServer?.serverName])

  useEffect(() => {
    if (activeServer?.serverName) loadHistory()
  }, [activeServer?.serverName, loadHistory])

  const chosen = wipeTypes.find((w) => w.id === pendingType)

  const openConfirm = (id: string) => {
    setPendingType(id)
    setShowConfirm(true)
  }
  const closeConfirm = () => {
    setShowConfirm(false)
    setPendingType(null)
    setWipeNotes('')
  }

  const executeWipe = async () => {
    if (!activeServer?.serverName || !pendingType) return
    const chosen = wipeTypes.find((w) => w.id === pendingType)
    if (!chosen) return
    closeConfirm()
    setWiping(true)
    setError(null)
    try {
      const body: Record<string, string> = { type: chosen.backendType }
      if (chosen.id === 'PLAYER_DATA' && targetSteamId.trim()) {
        body.targetSteamId = targetSteamId.trim()
      }
      if (wipeNotes.trim()) {
        body.notes = wipeNotes.trim()
      }
      await api.post(`/servers/${activeServer.serverName}/wipe`, body)
      setTargetSteamId('')
      loadHistory()
    } catch (e) {
      setError(`Wipe failed: ${(e as Error).message}`)
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="main fadein">
      <PageHeader
        title="Wipe Manager"
        subtitle="Dispatch wipe command to server · view history"
        actions={
          <div className="btn-group">
            <button
              onClick={() => setTab('quick')}
              className={`btn btn-sm ${tab === 'quick' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Quick Wipe
            </button>
            <button
              onClick={() => setTab('history')}
              className={`btn btn-sm ${tab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
            >
              History ({history.length})
            </button>
          </div>
        }
      />

      <div className="warn-banner">
        ⚠ Wipes are <strong style={{ margin: '0 3px' }}>irreversible</strong>. The wipe command is dispatched to the game server immediately.
      </div>

      {activeServer && !activeServer.running && (
        <div className="info-banner">
          Server is offline — wipes cannot be executed until the server is running.
        </div>
      )}

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

      {wiping && (
        <div className="info-banner">
          ⏳ Wipe in progress — this may take 10–30 seconds. Do not close this page.
        </div>
      )}

      {tab === 'quick' && (
        <div className="wipe-grid">
          {wipeTypes.map((w) => (
            <div key={w.id} className="card">
              <div className="card-header">
                <span className="card-title">
                  {w.icon} {w.label}
                </span>
              </div>
              <div
                className="card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
                  {w.desc}
                </p>
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'var(--dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: '4px',
                    }}
                  >
                    Deletes
                  </div>
                  {w.deletes.slice(0, 4).map((f) => (
                    <div
                      key={f}
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: '10px',
                        color: 'var(--red)',
                        padding: '1px 0',
                      }}
                    >
                      ✕ {f}
                    </div>
                  ))}
                  {w.deletes.length > 4 && (
                    <div
                      style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--dim)' }}
                    >
                      + {w.deletes.length - 4} more
                    </div>
                  )}
                </div>
                {w.id === 'PLAYER_DATA' && (
                  <div className="setting-row" style={{ padding: 0 }}>
                    <div className="setting-info">
                      <div className="setting-name">Steam ID</div>
                      <div className="setting-desc">Leave blank to wipe all player data</div>
                    </div>
                    <input
                      className="text-input"
                      value={targetSteamId}
                      onChange={(e) => setTargetSteamId(e.target.value)}
                      placeholder="76561198..."
                      style={{ width: '180px' }}
                    />
                  </div>
                )}
                <button
                  className={`btn ${w.color} btn-sm`}
                  style={{ marginTop: 'auto' }}
                  onClick={() => openConfirm(w.id)}
                  disabled={wiping || !activeServer?.serverName || !activeServer?.running}
                >
                  Execute {w.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Wipe History</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Result</th>
                <th scope="col">Type</th>
                <th scope="col">Triggered By</th>
                <th scope="col">Date</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', padding: '24px', color: 'var(--dim)' }}
                  >
                    No wipe history.
                  </td>
                </tr>
              )}
              {history.map((w) => (
                <tr key={w.id}>
                  <td>
                    {w.success ? (
                      <span className="pill pill-green">OK</span>
                    ) : (
                      <span className="pill pill-red" title={w.errorMsg ?? undefined}>Failed</span>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${w.type === 'full' ? 'pill-red' : w.type === 'map' ? 'pill-orange' : 'pill-muted'}`} style={{ fontSize: '10px' }}>
                      {w.type === 'playerdata' ? (w.targetSteamId ? `Player ${w.targetSteamId}` : 'All Players') : w.type === 'map' ? 'Map' : 'Full'}
                    </span>
                  </td>
                  <td className="bright" title={w.triggeredBy}>
                    {w.triggeredByName ?? w.triggeredBy}
                  </td>
                  <td className="mono" style={{ color: 'var(--dim)' }}>
                    {new Date(w.createdAt).toLocaleString()}
                  </td>
                  <td>{w.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showConfirm && chosen && (
        <ConfirmDialog
          title="Confirm Wipe"
          confirmWord={activeServer?.name ?? 'confirm'}
          onCancel={closeConfirm}
          onConfirm={executeWipe}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
            You are about to execute a{' '}
            <strong style={{ color: 'var(--text-bright)' }}>{chosen.label}</strong> on
            <strong style={{ color: 'var(--orange)' }}>
              {' '}{activeServer?.name ?? 'this server'}
            </strong>
            {pendingType === 'PLAYER_DATA' && targetSteamId.trim() && (
              <> targeting player <strong style={{ color: 'var(--text-bright)' }}>{targetSteamId.trim()}</strong></>
            )}
            .
          </div>
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              padding: '12px',
              fontSize: '12px',
            }}
          >
            <div
              style={{
                color: 'var(--dim)',
                marginBottom: '6px',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Files to be deleted
            </div>
            {chosen.deletes.map((f) => (
              <div
                key={f}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--red)',
                  padding: '1px 0',
                }}
              >
                ✕ {f}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              htmlFor="wipe-notes"
              style={{ fontSize: '10px', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Notes (optional)
            </label>
            <textarea
              id="wipe-notes"
              className="text-input"
              rows={2}
              value={wipeNotes}
              onChange={(e) => setWipeNotes(e.target.value)}
              placeholder="e.g. Weekly scheduled wipe, player requested reset..."
              style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '11px' }}
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
