import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import { useServer } from '../hooks/useServer.js'
import { api } from '../api/client.js'

type WipeLog = {
  id: string
  wipeType: string
  triggeredBy: string
  createdAt: string
  notes: string | null
  backupPath: string | null
}

const wipeTypes = [
  {
    id: 'MAP_ONLY',
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
    label: 'Full Wipe',
    color: 'btn-danger',
    icon: '⊠',
    desc: 'Deletes everything except access lists and server settings. Complete fresh start — use sparingly.',
    deletes: ['ChunkData/', 'RegionData/', 'PlayerData/', 'All world files', 'log.txt'],
  },
]

export default function WipeManager() {
  const { activeServer } = useServer()
  const [tab, setTab] = useState<'quick' | 'history'>('quick')
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingType, setPendingType] = useState<string | null>(null)
  const [createBackup, setCreateBackup] = useState(true)
  const [restartAfter, setRestartAfter] = useState(true)
  const [wiping, setWiping] = useState(false)
  const [history, setHistory] = useState<WipeLog[]>([])

  const loadHistory = useCallback(() => {
    if (!activeServer?.id) return
    api.get<WipeLog[]>(`/servers/${activeServer.id}/wipes`).then(setHistory).catch(console.error)
  }, [activeServer?.id])

  useEffect(() => {
    if (activeServer?.id) loadHistory()
  }, [activeServer?.id, loadHistory])

  const chosen = wipeTypes.find((w) => w.id === pendingType)

  const openConfirm = (id: string) => {
    setPendingType(id)
    setShowConfirm(true)
  }
  const closeConfirm = () => {
    setShowConfirm(false)
    setPendingType(null)
  }

  const executeWipe = async () => {
    if (!activeServer?.id || !pendingType) return
    closeConfirm()
    setWiping(true)
    try {
      await api.post(`/servers/${activeServer.id}/wipe`, {
        wipeType: pendingType,
        createBackup,
        serverWillRestart: restartAfter,
        keepPlayerData: pendingType === 'MAP_ONLY',
        keepAccessLists: true,
      })
      alert('Wipe completed successfully.')
      loadHistory()
    } catch (e) {
      alert(`Wipe failed: ${(e as Error).message}`)
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="main fadein">
      <PageHeader
        title="Wipe Manager"
        subtitle="Stop server → backup → delete files → restart"
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
        ⚠ Wipes are <strong style={{ margin: '0 3px' }}>irreversible</strong>. The server will be
        stopped automatically before any wipe executes.
      </div>

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
                <button
                  className={`btn ${w.color} btn-sm`}
                  style={{ marginTop: 'auto' }}
                  onClick={() => openConfirm(w.id)}
                  disabled={wiping || !activeServer?.id}
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
                <th>Type</th>
                <th>Triggered By</th>
                <th>Date</th>
                <th>Notes</th>
                <th>Backup</th>
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
                    <span className="pill pill-orange">{w.wipeType}</span>
                  </td>
                  <td className="bright">{w.triggeredBy}</td>
                  <td className="mono" style={{ color: 'var(--dim)' }}>
                    {new Date(w.createdAt).toLocaleString()}
                  </td>
                  <td>{w.notes ?? '—'}</td>
                  <td>
                    {w.backupPath ? (
                      <span className="pill pill-green">✓ Backup</span>
                    ) : (
                      <span className="pill pill-muted">None</span>
                    )}
                  </td>
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
            <strong style={{ color: 'var(--text-bright)' }}>{pendingType}</strong> wipe on
            <strong style={{ color: 'var(--orange)' }}>
              {' '}
              {activeServer?.name ?? 'this server'}
            </strong>
            . The server will be stopped first.
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
          <div className="setting-row" style={{ padding: 0 }}>
            <div className="setting-info">
              <div className="setting-name">Create backup before wiping</div>
            </div>
            <div
              className={`toggle ${createBackup ? 'on' : ''}`}
              onClick={() => setCreateBackup((p) => !p)}
            />
          </div>
          <div className="setting-row" style={{ padding: 0 }}>
            <div className="setting-info">
              <div className="setting-name">Restart server after wipe</div>
            </div>
            <div
              className={`toggle ${restartAfter ? 'on' : ''}`}
              onClick={() => setRestartAfter((p) => !p)}
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
