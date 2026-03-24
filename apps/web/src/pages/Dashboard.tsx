import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { useActivityFeed } from '../hooks/useActivityFeed.js'
import { useSettings } from '../hooks/useSettings.js'
import { api } from '../api/client.js'

type Schedule = {
  id: string
  label: string
  type: string
  enabled: boolean
  nextRun: string | null
}

type CombatEvent = {
  id: string
  displayName: string
  cause: string
  killerDisplayName: string | null
  killerSteamId: string | null
  weapon: string | null
  createdAt: string
}

type ChatMessage = {
  id: string
  displayName: string
  channel: string
  message: string
  createdAt: string
}

const EVENT_PILL: Record<string, { className: string; label: string }> = {
  JOIN: { className: 'pill-green', label: 'Join' },
  LEAVE: { className: 'pill-muted', label: 'Leave' },
  BAN: { className: 'pill-red', label: 'Ban' },
  UNBAN: { className: 'pill-green', label: 'Unban' },
  KICK: { className: 'pill-orange', label: 'Kick' },
  WHITELIST: { className: 'pill-green', label: 'Whitelist' },
  REMOVEWHITELIST: { className: 'pill-muted', label: 'Unwhitelist' },
  SETPERMISSION: { className: 'pill-muted', label: 'Permission' },
  COMMAND: { className: 'pill-muted', label: 'Command' },
  WIPE: { className: 'pill-red', label: 'Wipe' },
  RESTART: { className: 'pill-orange', label: 'Restart' },
  SETTINGS_SET: { className: 'pill-muted', label: 'Settings' },
  SCHEDULE_RUN: { className: 'pill-orange', label: 'Schedule' },
  SCHEDULE_CREATE: { className: 'pill-green', label: 'Schedule' },
  SCHEDULE_DELETE: { className: 'pill-red', label: 'Schedule' },
  SCHEDULE_UPDATE: { className: 'pill-muted', label: 'Schedule' },
  LIST_CREATE: { className: 'pill-green', label: 'List' },
  LIST_DELETE: { className: 'pill-red', label: 'List' },
}

export default function Dashboard() {
  const { activeServer } = useServer()
  const running = activeServer?.running ?? false
  const { events: activityEvents, status: activityStatus } = useActivityFeed(
    running ? (activeServer?.serverName ?? null) : null
  )
  const { settings } = useSettings(running ? (activeServer?.serverName ?? null) : null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [playerCount, setPlayerCount] = useState<number>(0)
  const [recentCombat, setRecentCombat] = useState<CombatEvent[]>([])
  const [recentChat, setRecentChat] = useState<ChatMessage[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const activityScrollRef = useRef<HTMLDivElement>(null)
  const activityAtBottomRef = useRef(true)

  const handleActivityScroll = useCallback(() => {
    const el = activityScrollRef.current
    if (!el) return
    activityAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  useEffect(() => {
    if (!activeServer?.serverName) return
    api
      .get<Schedule[]>(`/servers/${activeServer.serverName}/schedules`)
      .then(setSchedules)
      .catch(console.error)
  }, [activeServer?.serverName])

  // Fetch player count, recent combat, and recent chat
  useEffect(() => {
    if (!activeServer?.serverName) return

    api.get<{ data: unknown[]; total: number }>(`/servers/${activeServer.serverName}/players?filter=online`)
      .then((res) => setPlayerCount(res.total))
      .catch(() => setPlayerCount(0))

    api.get<{ data: CombatEvent[] }>(`/servers/${activeServer.serverName}/combat-log?limit=10`)
      .then((res) => setRecentCombat(res.data))
      .catch(() => {})

    api.get<{ data: ChatMessage[] }>(`/servers/${activeServer.serverName}/chat?limit=10`)
      .then((res) => setRecentChat(res.data))
      .catch(() => {})
  }, [activeServer?.serverName])

  useEffect(() => {
    if (activityAtBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activityEvents])

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
          <div className="stat-value">{playerCount}</div>
          <div className="stat-sub">Online now</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Max Players</div>
          <div className="stat-value">{String(settings?.MaxPlayers ?? '—')}</div>
          <div className="stat-sub">Configured slots</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Schedules</div>
          <div className="stat-value">{enabledSchedules.length}</div>
          <div className="stat-sub">Active tasks</div>
        </div>
      </div>

      {/* ── Row 1: Activity Feed + Recent Combat ──────────────────── */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Activity</span>
            <span className={`pill ${activityStatus === 'connected' ? 'pill-green' : 'pill-muted'}`}>
              {activityStatus === 'connected' && <span className="dot dot-green pulse" />}
              {activityStatus === 'connected' ? 'Live' : activityStatus === 'connecting' ? 'Connecting' : 'Offline'}
            </span>
          </div>
          <div
            ref={activityScrollRef}
            onScroll={handleActivityScroll}
            style={{ background: 'var(--bg0)', overflowY: 'auto', maxHeight: '280px' }}
          >
            {activityEvents.length === 0 && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--dim)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                }}
              >
                {activeServer?.running ? 'Waiting for activity…' : 'Server is not running.'}
              </div>
            )}
            {[...activityEvents].reverse().map((e) => {
              const pill = EVENT_PILL[e.type] ?? { className: 'pill-muted', label: e.type }
              return (
                <div key={e.id} className="log-entry log-info">
                  <span className="log-time">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`pill ${pill.className}`}
                    style={{ fontSize: '8px', marginRight: '6px', flexShrink: 0 }}
                  >
                    {pill.label}
                  </span>
                  <span className="log-msg">{e.detail}</span>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Combat</span>
            <Link to="/activity" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '280px' }}>
            {recentCombat.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                No combat events yet.
              </div>
            )}
            {recentCombat.map((e) => (
              <div key={e.id} className={`log-entry ${e.killerSteamId ? 'combat-row-pvp' : 'combat-row-pve'}`}>
                <span className="log-time">{new Date(e.createdAt).toLocaleTimeString()}</span>
                <span className="log-msg">
                  <span style={{ color: 'var(--text-bright)' }}>{e.displayName}</span>
                  {e.killerDisplayName ? (
                    <>
                      <span style={{ color: 'var(--dim)', margin: '0 4px' }}>killed by</span>
                      <span style={{ color: 'var(--orange)' }}>{e.killerDisplayName}</span>
                      {e.weapon && <span style={{ color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '6px' }}>({e.weapon})</span>}
                    </>
                  ) : (
                    <span style={{ color: 'var(--dim)', margin: '0 4px' }}>died to {e.cause}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 2: Recent Chat + Upcoming Schedules ───────────────── */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Chat</span>
            <Link to="/activity" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '280px' }}>
            {recentChat.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                No chat messages yet.
              </div>
            )}
            {recentChat.map((m) => {
              const chColor = m.channel === 'global' ? 'pill-green' : m.channel === 'team' ? 'pill-orange' : 'pill-muted'
              return (
                <div key={m.id} className="log-entry log-info">
                  <span className="log-time">{new Date(m.createdAt).toLocaleTimeString()}</span>
                  <span className={`pill ${chColor}`} style={{ fontSize: '8px', marginRight: '6px', flexShrink: 0 }}>{m.channel}</span>
                  <span className="log-msg">
                    <span style={{ color: 'var(--text-bright)' }}>{m.displayName}</span>: {m.message}
                  </span>
                </div>
              )
            })}
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
