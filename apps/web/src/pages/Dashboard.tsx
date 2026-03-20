import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { useLiveLog } from '../hooks/useLiveLog.js'
import { useSettings } from '../hooks/useSettings.js'
import { api } from '../api/client.js'

type Schedule = {
  id: string
  label: string
  type: string
  enabled: boolean
  nextRun: string | null
}

const PLAYER_POLL_MS = 30_000

function extractPlayerCount(raw: string): number | null {
  const m = raw.match(/(\d+)\s+player/i)
  if (m && m[1] !== undefined) return parseInt(m[1], 10)
  return null
}

export default function Dashboard() {
  const { activeServer } = useServer()
  const running = activeServer?.running ?? false
  const { lines: liveLog } = useLiveLog(activeServer?.id ?? null)
  const { settings } = useSettings(running ? (activeServer?.id ?? null) : null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [playerRaw, setPlayerRaw] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeServer?.id) return
    api
      .get<Schedule[]>(`/servers/${activeServer.id}/schedules`)
      .then(setSchedules)
      .catch(console.error)
  }, [activeServer?.id])

  // Poll getplayers every 30s (only when server is running)
  const pollPlayers = useCallback(() => {
    if (!activeServer?.id || !running) return
    api
      .get<{ raw?: string }>(`/servers/${activeServer.id}/players`)
      .then((data) => setPlayerRaw(data?.raw ?? null))
      .catch(() => {/* ignore — degraded mode */})
  }, [activeServer?.id, running])

  useEffect(() => {
    if (!activeServer?.id || !running) { setPlayerRaw(null); return }
    pollPlayers()
    const id = setInterval(pollPlayers, PLAYER_POLL_MS)
    return () => clearInterval(id)
  }, [activeServer?.id, running, pollPlayers])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveLog])

  const maxPlayers = settings?.MaxPlayers ?? '—'
  const worldName = settings?.WorldName ?? '—'
  const playerCount = playerRaw !== null ? (extractPlayerCount(playerRaw) ?? '—') : '—'
  const enabledSchedules = schedules.filter((s) => s.enabled)

  return (
    <div className="main fadein">
      {/* ── Stat strip ─────────────────────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-item">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: '16px', paddingTop: '6px' }}>
            {activeServer?.running ? (
              <span style={{ color: 'var(--green)' }}>Running</span>
            ) : (
              <span style={{ color: 'var(--dim)' }}>Stopped</span>
            )}
          </div>
          <div className="stat-sub">{activeServer?.name ?? 'No server selected'}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Players</div>
          <div className="stat-value">{String(playerCount)}</div>
          <div className="stat-sub">Online now</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Max Players</div>
          <div className="stat-value">{String(maxPlayers)}</div>
          <div className="stat-sub">Configured slots</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Schedules</div>
          <div className="stat-value">{enabledSchedules.length}</div>
          <div className="stat-sub">Active tasks</div>
        </div>
      </div>

      {/* ── Activity log + Quick actions ─────────────────────────── */}
      <div className="grid-3">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Activity Log</span>
            <span className="pill pill-green">
              <span className="dot dot-green pulse" />
              Live
            </span>
          </div>
          <div style={{ background: 'var(--bg0)', overflowY: 'auto', maxHeight: '320px' }}>
            {liveLog.length === 0 && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--dim)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                }}
              >
                {activeServer?.running ? 'Waiting for log lines…' : 'Server is not running.'}
              </div>
            )}
            {liveLog.map((l) => (
              <div key={l.lineId} className="log-entry log-info">
                <span className="log-time">{new Date(l.ts).toLocaleTimeString()}</span>
                <span className="log-msg">{l.raw}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Actions</span>
            </div>
            <div className="card-body">
              <div className="btn-group">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    activeServer?.id &&
                    api.post(`/servers/${activeServer.id}/actions/forcesave`).catch(console.error)
                  }
                >
                  Force Save
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    activeServer?.id &&
                    api
                      .post(`/servers/${activeServer.id}/actions/announcement`, {
                        message: 'Server maintenance in 5 minutes.',
                      })
                      .catch(console.error)
                  }
                >
                  Announcement
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    activeServer?.id &&
                    api
                      .post(`/servers/${activeServer.id}/actions/weather`, { type: 'clear' })
                      .catch(console.error)
                  }
                >
                  Set Weather
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    activeServer?.id &&
                    api.post(`/servers/${activeServer.id}/actions/killall`).catch(console.error)
                  }
                >
                  Kill All
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Server info + Upcoming schedules ─────────────────────── */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Server Info</span>
            <span className={`pill ${activeServer?.running ? 'pill-green' : 'pill-muted'}`}>
              {activeServer?.running && <span className="dot dot-green pulse" />}
              {activeServer?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="card-body-0">
            {(
              [
                ['Display Name', activeServer?.name ?? '—'],
                ['World Name', String(worldName)],
                ['Game Port', activeServer ? `${activeServer.gamePort} (UDP)` : '—'],
                ['Query Port', activeServer ? `${activeServer.queryPort} (UDP)` : '—'],
                ['Container', activeServer?.containerName ?? '(env default)'],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="setting-row">
                <span className="setting-key" style={{ minWidth: '110px' }}>
                  {k}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '12px',
                    color: 'var(--text)',
                    textAlign: 'right',
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Upcoming Schedules</span>
            <Link
              to="/schedules"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                color: 'var(--muted)',
                textDecoration: 'none',
              }}
            >
              View all →
            </Link>
          </div>
          <div className="card-body-0">
            {enabledSchedules.length === 0 && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--dim)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                }}
              >
                No active schedules.
              </div>
            )}
            {enabledSchedules.slice(0, 5).map((s) => (
              <div key={s.id} className="setting-row">
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '10px',
                      color: 'var(--dim)',
                      marginTop: '2px',
                    }}
                  >
                    {s.nextRun ? new Date(s.nextRun).toLocaleString() : '—'}
                  </div>
                </div>
                <span
                  className={`pill ${s.type === 'RESTART' ? 'pill-orange' : 'pill-muted'}`}
                  style={{ fontSize: '9px', flexShrink: 0 }}
                >
                  {s.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
