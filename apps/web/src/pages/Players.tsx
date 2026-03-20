import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { api } from '../api/client.js'

const POLL_INTERVAL_MS = 30_000

const PERMISSION_LEVELS = ['client', 'operator', 'admin', 'server'] as const
type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

interface Player {
  steamId: string
  name: string
  raw: string
}

/** Try to extract a 17-digit Steam ID starting with 7656 from a line. */
function extractSteamId(line: string): string | null {
  const match = line.match(/\b(7656\d{13})\b/)
  return match?.[1] ?? null
}

/**
 * Try to extract a player name from the same line as the Steam ID.
 * Handles patterns like:
 *   "Name: PlayerName  SteamID: 76561198..."
 *   "PlayerName (76561198...)"
 *   "76561198... PlayerName"
 */
function extractName(line: string, steamId: string): string {
  // Strip the steam ID itself to reduce noise
  const stripped = line.replace(steamId, '').trim()

  // "Name: Foo" or "name: Foo"
  const nameLabel = stripped.match(/[Nn]ame\s*:\s*([^\s|,]+(?:\s[^\s|,]+)*?)(?:\s{2,}|$|\|)/i)
  if (nameLabel?.[1]) return nameLabel[1].trim()

  // "Foo (76561...)" — parenthesised steam ID already removed, so just grab the part before '('
  const beforeParen = stripped.match(/^([^(]+)\s*\(/)
  if (beforeParen?.[1]?.trim()) return beforeParen[1].trim()

  // Anything that looks like a word sequence left over
  const words = stripped.replace(/[^a-zA-Z0-9_ \-]/g, ' ').trim()
  if (words.length > 0 && words.length < 64) return words

  return steamId
}

/**
 * Parse the raw getplayers response into a list of players.
 * Returns an empty array if no Steam IDs can be found.
 */
function parsePlayers(raw: string): Player[] {
  const players: Player[] = []
  const seen = new Set<string>()

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const steamId = extractSteamId(trimmed)
    if (!steamId || seen.has(steamId)) continue
    seen.add(steamId)
    players.push({ steamId, name: extractName(trimmed, steamId), raw: trimmed })
  }

  return players
}

function extractPlayerCount(raw: string): number | null {
  const match = raw.match(/(\d+)\s+player/i)
  if (match && match[1] !== undefined) return parseInt(match[1], 10)
  return null
}

type ActionStatus = { type: 'ok' | 'err'; message: string }

export default function Players() {
  const { activeServer } = useServer()

  const [raw, setRaw] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [showRawFallback, setShowRawFallback] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [permLevel, setPermLevel] = useState<Record<string, PermissionLevel>>({})
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({})
  const [pendingAction, setPendingAction] = useState<string | null>(null)

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
        const parsed = parsePlayers(rawData)
        setPlayers(parsed)
        setShowRawFallback(parsed.length === 0)
        setLastUpdated(new Date())
        setSecondsAgo(0)
      })
      .catch((e) => setError((e as Error).message || 'Failed to load players'))
      .finally(() => setLoading(false))
  }, [activeServer?.id])

  // Initial load + poll every 30 s
  useEffect(() => {
    if (!activeServer?.id) return
    if (!activeServer.running) {
      setPlayers([])
      setRaw(null)
      setError(null)
      return
    }
    load()
    const pollTimer = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(pollTimer)
  }, [activeServer?.id, activeServer?.running, load])

  // Seconds-ago counter
  useEffect(() => {
    if (!lastUpdated) return
    const ticker = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(ticker)
  }, [lastUpdated])

  function toggleExpand(steamId: string) {
    setExpandedId((prev) => (prev === steamId ? null : steamId))
    // Clear any lingering status for the row being opened
    setActionStatus((prev) => {
      const next = { ...prev }
      delete next[steamId]
      return next
    })
  }

  function showStatus(steamId: string, type: 'ok' | 'err', message: string) {
    setActionStatus((prev) => ({ ...prev, [steamId]: { type, message } }))
    setTimeout(() => {
      setActionStatus((prev) => {
        const next = { ...prev }
        delete next[steamId]
        return next
      })
    }, 3000)
  }

  async function runAction(
    steamId: string,
    label: string,
    endpoint: string,
    body?: Record<string, unknown>
  ) {
    if (!activeServer?.id) return
    const key = `${steamId}:${label}`
    setPendingAction(key)
    try {
      await api.post(endpoint, body)
      showStatus(steamId, 'ok', `${label} succeeded`)
    } catch (e) {
      showStatus(steamId, 'err', (e as Error).message || `${label} failed`)
    } finally {
      setPendingAction(null)
    }
  }

  function getPermLevel(steamId: string): PermissionLevel {
    return permLevel[steamId] ?? 'client'
  }

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim() || !activeServer?.id) return
    try {
      await api.post(`/servers/${activeServer.id}/actions/broadcast`, { message: broadcastMsg.trim() })
    } catch {
      // non-blocking — broadcast failure doesn't warrant a full error state
    }
    setShowBroadcast(false)
    setBroadcastMsg('')
  }

  const playerCount = raw !== null ? (players.length > 0 ? players.length : extractPlayerCount(raw)) : null

  const updatedLabel = lastUpdated
    ? secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`
    : 'not loaded'

  return (
    <div className="main fadein">
      <PageHeader
        title="Player Management"
        subtitle="getplayers · kick · ban · unban · heal · whitelist · setpermissions"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading || !activeServer?.running}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowBroadcast(true)}
              disabled={!activeServer?.running}
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

      {activeServer && !activeServer.running && (
        <div className="info-banner">
          Server is offline — player data is unavailable. Start the server from Server Management to see live player data.
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

      {/* ── Player Table ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Online Players
            {playerCount !== null && (
              <span
                className="pill pill-green"
                style={{ marginLeft: '10px', fontSize: '10px' }}
              >
                <span className="dot dot-green pulse" />
                {playerCount} player{playerCount !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span
            className="card-meta"
            style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}
          >
            {updatedLabel}
          </span>
        </div>

        <div className="card-body-0">
          {loading && !raw ? (
            <div className="empty-state">
              <div className="empty-state-title">Loading…</div>
            </div>
          ) : showRawFallback || (raw !== null && players.length === 0) ? (
            /* Fallback: couldn't parse any players — show raw output */
            <>
              {raw !== null && players.length === 0 && !showRawFallback && null}
              <div
                style={{
                  padding: '10px 16px 6px',
                  fontFamily: 'var(--mono)',
                  fontSize: '10px',
                  color: 'var(--dim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                Raw output (no players parsed)
              </div>
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
                {raw ?? 'No data. Click Refresh or wait for the next poll.'}
              </pre>
            </>
          ) : players.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No players online</div>
              <div className="empty-state-desc">
                {raw === null ? 'Click Refresh or wait for the next poll.' : 'Server returned no player data.'}
              </div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Steam ID</th>
                  <th style={{ width: '28px' }} />
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const isExpanded = expandedId === p.steamId
                  const status = actionStatus[p.steamId]
                  const sid = activeServer!.id

                  return (
                    <Fragment key={p.steamId}>
                      <tr
                        onClick={() => toggleExpand(p.steamId)}
                        style={{ cursor: 'pointer' }}
                        aria-expanded={isExpanded}
                      >
                        <td className="bright">{p.name !== p.steamId ? p.name : '—'}</td>
                        <td className="mono">{p.steamId}</td>
                        <td
                          style={{
                            color: 'var(--dim)',
                            fontFamily: 'var(--mono)',
                            fontSize: '10px',
                            textAlign: 'right',
                            paddingRight: '16px',
                          }}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`detail-${p.steamId}`}>
                          <td
                            colSpan={3}
                            style={{ padding: 0, background: 'var(--bg2)' }}
                          >
                            <div style={{ padding: '16px 20px' }}>

                              {/* Player identity summary */}
                              <div
                                className="row"
                                style={{ marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}
                              >
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: 'var(--text-bright)',
                                    fontSize: '13px',
                                  }}
                                >
                                  {p.name !== p.steamId ? p.name : 'Unknown'}
                                </span>
                                <span
                                  style={{
                                    fontFamily: 'var(--mono)',
                                    fontSize: '11px',
                                    color: 'var(--muted)',
                                  }}
                                >
                                  {p.steamId}
                                </span>
                              </div>

                              {/* Action status feedback */}
                              {status && (
                                <div
                                  className={status.type === 'ok' ? 'info-banner' : 'error-banner'}
                                  style={{ marginBottom: '12px', fontSize: '11px' }}
                                  role="status"
                                >
                                  {status.message}
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="btn-group" style={{ flexWrap: 'wrap', gap: '6px' }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={pendingAction !== null}
                                  onClick={() =>
                                    runAction(p.steamId, 'Heal', `/servers/${sid}/players/${p.steamId}/heal`)
                                  }
                                >
                                  Heal
                                </button>

                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={pendingAction !== null}
                                  onClick={() =>
                                    runAction(p.steamId, 'Unban', `/servers/${sid}/players/${p.steamId}/unban`)
                                  }
                                >
                                  Unban
                                </button>

                                <button
                                  className="btn btn-primary btn-sm"
                                  disabled={pendingAction !== null}
                                  onClick={() =>
                                    runAction(p.steamId, 'Whitelist', `/servers/${sid}/players/${p.steamId}/whitelist`)
                                  }
                                >
                                  Whitelist
                                </button>

                                <button
                                  className="btn btn-danger btn-sm"
                                  disabled={pendingAction !== null}
                                  onClick={() =>
                                    runAction(p.steamId, 'Kick', `/servers/${sid}/players/${p.steamId}/kick`)
                                  }
                                >
                                  Kick
                                </button>

                                <button
                                  className="btn btn-danger btn-sm"
                                  disabled={pendingAction !== null}
                                  onClick={() =>
                                    runAction(p.steamId, 'Ban', `/servers/${sid}/players/${p.steamId}/ban`)
                                  }
                                >
                                  Ban
                                </button>
                              </div>

                              {/* Set Permissions row */}
                              <div
                                className="row"
                                style={{ marginTop: '12px', gap: '8px', flexWrap: 'wrap' }}
                              >
                                <span
                                  style={{
                                    fontFamily: 'var(--mono)',
                                    fontSize: '11px',
                                    color: 'var(--muted)',
                                    flexShrink: 0,
                                  }}
                                >
                                  Set permission:
                                </span>
                                <select
                                  className="sel-input"
                                  value={getPermLevel(p.steamId)}
                                  onChange={(e) =>
                                    setPermLevel((prev) => ({
                                      ...prev,
                                      [p.steamId]: e.target.value as PermissionLevel,
                                    }))
                                  }
                                  aria-label="Permission level"
                                >
                                  {PERMISSION_LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                      [{lvl}]
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={pendingAction !== null}
                                  onClick={() =>
                                    runAction(
                                      p.steamId,
                                      'Set Permissions',
                                      `/servers/${sid}/players/${p.steamId}/permissions`,
                                      { level: getPermLevel(p.steamId) }
                                    )
                                  }
                                >
                                  Apply
                                </button>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
