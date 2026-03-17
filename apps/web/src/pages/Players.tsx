import { useState, useEffect, useCallback, useRef } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { api } from '../api/client.js'

const POLL_INTERVAL_MS = 30_000

function extractPlayerCount(raw: string): number | null {
  // Try to match a line containing "player" with a leading number, e.g. "3 players online"
  const match = raw.match(/(\d+)\s+player/i)
  if (match && match[1] !== undefined) return parseInt(match[1], 10)
  return null
}

export default function Players() {
  const { activeServer } = useServer()

  const [raw, setRaw] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)

  const [steamIdInput, setSteamIdInput] = useState('')

  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const broadcastModalRef = useRef<HTMLDivElement>(null)

  // Focus trap for broadcast modal
  useEffect(() => {
    if (!showBroadcast) return
    const modal = broadcastModalRef.current
    if (!modal) return
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [showBroadcast])

  const load = useCallback(() => {
    if (!activeServer?.id) return
    setLoading(true)
    api
      .get<{ raw: string }>(`/servers/${activeServer.id}/players`)
      .then(({ raw: rawData }) => {
        setRaw(rawData)
        setLastUpdated(new Date())
        setSecondsAgo(0)
      })
      .catch((e) => setError((e as Error).message || 'Failed to load players'))
      .finally(() => setLoading(false))
  }, [activeServer?.id])

  // Initial load + poll every 30 s
  useEffect(() => {
    if (!activeServer?.id) return
    load()
    const pollTimer = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(pollTimer)
  }, [activeServer?.id, load])

  // Seconds-ago counter
  useEffect(() => {
    if (!lastUpdated) return
    const ticker = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(ticker)
  }, [lastUpdated])

  const dispatch = (cmd: string) => {
    if (!activeServer?.id) return
    api
      .post(`/servers/${activeServer.id}/console/command`, { command: cmd })
      .catch((e) => setError((e as Error).message || 'Command failed'))
  }

  const sendBroadcast = () => {
    if (!broadcastMsg.trim()) return
    dispatch('say ' + broadcastMsg.trim())
    setShowBroadcast(false)
    setBroadcastMsg('')
  }

  const playerCount = raw !== null ? extractPlayerCount(raw) : null

  const actionButtons: { label: string; cmd: (id: string) => string; danger?: boolean }[] = [
    { label: 'Kick', cmd: (id) => `kick ${id}`, danger: true },
    { label: 'Ban', cmd: (id) => `ban ${id}`, danger: true },
    { label: 'Unban', cmd: (id) => `unban ${id}` },
    { label: 'Heal', cmd: (id) => `heal ${id}` },
    { label: 'Whitelist', cmd: (id) => `whitelist ${id}` },
    { label: 'Set Admin', cmd: (id) => `setpermissions ${id} admin` },
  ]

  return (
    <div className="main fadein">
      <PageHeader
        title="Player Management"
        subtitle="getplayers · kick · ban · unban · heal · whitelist · setpermissions"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowBroadcast(true)}
            >
              Broadcast
            </button>
          </>
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

      {/* ── Broadcast Modal ─────────────────────────────────── */}
      {showBroadcast && (
        <div className="overlay" onClick={() => setShowBroadcast(false)}>
          <div
            ref={broadcastModalRef}
            className="modal fadein"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-modal-title"
          >
            <div className="card-header">
              <span className="card-title" id="broadcast-modal-title">Broadcast Message</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setShowBroadcast(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div
              className="card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="broadcast-msg" className="setting-info">
                  <div className="setting-name">Message</div>
                  <div className="setting-desc">Sent to all online players</div>
                </label>
                <input
                  id="broadcast-msg"
                  className="text-input"
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendBroadcast() }}
                  placeholder="Server message..."
                  autoFocus
                />
              </div>
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowBroadcast(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={sendBroadcast}
                  disabled={!broadcastMsg.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Live output ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            getplayers output
            {playerCount !== null && (
              <span
                className="pill pill-green"
                style={{ marginLeft: '10px', fontSize: '10px' }}
              >
                {playerCount} player{playerCount !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span
            className="card-meta"
            style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}
          >
            {lastUpdated
              ? secondsAgo < 5
                ? 'just now'
                : `${secondsAgo}s ago`
              : 'not loaded'}
          </span>
        </div>
        <div className="card-body-0">
          <pre
            style={{
              margin: 0,
              padding: '12px 16px',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              color: 'var(--dim)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              minHeight: '80px',
              maxHeight: '320px',
              overflowY: 'auto',
            }}
          >
            {loading && !raw
              ? 'Loading…'
              : raw ?? 'No data. Click Refresh or wait for the next poll.'}
          </pre>
        </div>
      </div>

      {/* ── Player Actions ───────────────────────────────────── */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">
          <span className="card-title">Player Actions</span>
          <span className="card-meta">Enter a Steam ID, then choose an action</span>
        </div>
        <div className="card-body">
          <div className="setting-row" style={{ padding: '0 0 14px' }}>
            <label htmlFor="player-steamid" className="setting-info">
              <div className="setting-name">Steam ID</div>
              <div className="setting-desc">17-digit Steam ID of the target player</div>
            </label>
            <input
              id="player-steamid"
              className="text-input"
              value={steamIdInput}
              onChange={(e) => setSteamIdInput(e.target.value.trim())}
              placeholder="76561198000000000"
              aria-label="Target Steam ID"
            />
          </div>
          <div className="btn-group">
            {actionButtons.map(({ label, cmd, danger }) => (
              <button
                key={label}
                className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-ghost'}`}
                disabled={!steamIdInput}
                onClick={() => dispatch(cmd(steamIdInput))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
