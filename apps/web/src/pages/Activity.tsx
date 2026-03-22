import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { api } from '../api/client.js'

// ── Types ─────────────────────────────────────────────────────────────

type ActivityStats = {
  killsToday: number
  deathsToday: number
  messagesToday: number
  playersSeenToday: number
}

type CombatEntry = {
  id: string
  displayName: string
  cause: string
  killerSteamId: string | null
  killerDisplayName: string | null
  weapon: string | null
  createdAt: string
  player: { steamId: string; displayName: string }
}

type CombatResponse = {
  data: CombatEntry[]
  page: number
  limit: number
  total: number
}

type ChatEntry = {
  id: string
  displayName: string
  message: string
  channel: string
  createdAt: string
  player: { steamId: string; displayName: string }
}

type ChatResponse = {
  data: ChatEntry[]
  page: number
  limit: number
  total: number
}

type CombatFilter = 'all' | 'pvp' | 'pve'
type ChannelFilter = 'all' | 'global' | 'team' | 'local'

// ── Constants ─────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  global: 'pill-green',
  team: 'pill-orange',
  local: 'pill-muted',
}

const COMBAT_LIMIT = 50
const CHAT_LIMIT = 100

// ── Component ─────────────────────────────────────────────────────────

export default function Activity() {
  const { activeServer } = useServer()

  // Stats
  const [stats, setStats] = useState<ActivityStats | null>(null)

  // Combat state
  const [combatEntries, setCombatEntries] = useState<CombatEntry[]>([])
  const [combatTotal, setCombatTotal] = useState(0)
  const [combatPage, setCombatPage] = useState(1)
  const [combatLoading, setCombatLoading] = useState(false)
  const [combatFilter, setCombatFilter] = useState<CombatFilter>('all')
  const [combatSteamId, setCombatSteamId] = useState('')

  // Chat state
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([])
  const [chatTotal, setChatTotal] = useState(0)
  const [chatPage, setChatPage] = useState(1)
  const [chatLoading, setChatLoading] = useState(false)
  const [chatChannel, setChatChannel] = useState<ChannelFilter>('all')
  const [chatSteamId, setChatSteamId] = useState('')

  // ── Stats fetch ────────────────────────────────────────────────────

  const loadStats = useCallback(() => {
    if (!activeServer?.serverName) return
    api
      .get<ActivityStats>(`/servers/${activeServer.serverName}/activity-stats`)
      .then(setStats)
      .catch(console.error)
  }, [activeServer?.serverName])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // ── Combat fetch ───────────────────────────────────────────────────

  const loadCombat = useCallback(() => {
    if (!activeServer?.serverName) return
    setCombatLoading(true)
    const params = new URLSearchParams({ page: String(combatPage), limit: String(COMBAT_LIMIT), type: combatFilter })
    if (combatSteamId.trim()) params.set('steamId', combatSteamId.trim())
    api
      .get<CombatResponse>(`/servers/${activeServer.serverName}/combat-log?${params}`)
      .then((res) => {
        setCombatEntries(res.data)
        setCombatTotal(res.total)
      })
      .catch(console.error)
      .finally(() => setCombatLoading(false))
  }, [activeServer?.serverName, combatPage, combatFilter, combatSteamId])

  useEffect(() => {
    loadCombat()
  }, [loadCombat])

  // ── Chat fetch ─────────────────────────────────────────────────────

  const loadChat = useCallback(() => {
    if (!activeServer?.serverName) return
    setChatLoading(true)
    const params = new URLSearchParams({ page: String(chatPage), limit: String(CHAT_LIMIT) })
    if (chatChannel !== 'all') params.set('channel', chatChannel)
    if (chatSteamId.trim()) params.set('steamId', chatSteamId.trim())
    api
      .get<ChatResponse>(`/servers/${activeServer.serverName}/chat?${params}`)
      .then((res) => {
        setChatEntries(res.data)
        setChatTotal(res.total)
      })
      .catch(console.error)
      .finally(() => setChatLoading(false))
  }, [activeServer?.serverName, chatPage, chatChannel, chatSteamId])

  useEffect(() => {
    loadChat()
  }, [loadChat])

  // ── Derived ────────────────────────────────────────────────────────

  const combatTotalPages = Math.max(1, Math.ceil(combatTotal / COMBAT_LIMIT))
  const chatTotalPages = Math.max(1, Math.ceil(chatTotal / CHAT_LIMIT))

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="main fadein">
      <PageHeader
        title="Activity"
        subtitle="Combat events and player chat"
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { loadStats(); loadCombat(); loadChat() }}
            disabled={combatLoading || chatLoading}
          >
            {combatLoading || chatLoading ? 'Loading...' : 'Refresh'}
          </button>
        }
      />

      {/* ── Stats banner ───────────────────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-item">
          <div className="stat-label">Kills Today</div>
          <div className="stat-value">{stats?.killsToday ?? '—'}</div>
          <div className="stat-sub">PvP kills</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Deaths Today</div>
          <div className="stat-value">{stats?.deathsToday ?? '—'}</div>
          <div className="stat-sub">All causes</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Messages Today</div>
          <div className="stat-value">{stats?.messagesToday ?? '—'}</div>
          <div className="stat-sub">Chat messages</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Players Seen Today</div>
          <div className="stat-value">{stats?.playersSeenToday ?? '—'}</div>
          <div className="stat-sub">Unique players</div>
        </div>
      </div>

      {/* ── Split layout ────────────────────────────────────────────── */}
      <div className="activity-split">

        {/* ── Combat log (left) ─────────────────────────────────────── */}
        <div className="activity-split-half">
          <div className="card">
            <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap' }}>
              <span className="card-title">Combat ({combatTotal})</span>
              <div className="btn-group">
                {(['all', 'pvp', 'pve'] as CombatFilter[]).map((f) => (
                  <button
                    key={f}
                    className={`btn btn-sm ${combatFilter === f ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => { setCombatFilter(f); setCombatPage(1) }}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <input
                className="text-input"
                style={{ width: '160px', fontSize: '11px' }}
                placeholder="Filter by Steam ID..."
                value={combatSteamId}
                onChange={(e) => { setCombatSteamId(e.target.value); setCombatPage(1) }}
              />
            </div>

            <div className="card-body-0">
              {combatEntries.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No combat events</div>
                  <div className="empty-state-desc">
                    Combat data will appear here once the RCON event persister is active.
                  </div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Victim</th>
                      <th>Cause</th>
                      <th>Killer</th>
                      <th>Weapon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combatEntries.map((e) => (
                      <tr key={e.id}>
                        <td className="mono" style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          {new Date(e.createdAt).toLocaleString()}
                        </td>
                        <td className="bright">{e.displayName}</td>
                        <td>{e.cause}</td>
                        <td>{e.killerDisplayName ?? '—'}</td>
                        <td className="mono" style={{ fontSize: '11px' }}>{e.weapon ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {combatTotalPages > 1 && (
              <div className="card-footer" style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px' }}>
                <button className="btn btn-ghost btn-sm" disabled={combatPage <= 1} onClick={() => setCombatPage((p) => p - 1)}>
                  Prev
                </button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', alignSelf: 'center' }}>
                  {combatPage} / {combatTotalPages}
                </span>
                <button className="btn btn-ghost btn-sm" disabled={combatPage >= combatTotalPages} onClick={() => setCombatPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Chat log (right) ──────────────────────────────────────── */}
        <div className="activity-split-half">
          <div className="card">
            <div className="card-header" style={{ gap: '12px', flexWrap: 'wrap' }}>
              <span className="card-title">Chat ({chatTotal})</span>
              <div className="btn-group">
                {(['all', 'global', 'team', 'local'] as ChannelFilter[]).map((ch) => (
                  <button
                    key={ch}
                    className={`btn btn-sm ${chatChannel === ch ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => { setChatChannel(ch); setChatPage(1) }}
                  >
                    {ch === 'all' ? 'All' : ch.charAt(0).toUpperCase() + ch.slice(1)}
                  </button>
                ))}
              </div>
              <input
                className="text-input"
                style={{ width: '160px', fontSize: '11px' }}
                placeholder="Filter by Steam ID..."
                value={chatSteamId}
                onChange={(e) => { setChatSteamId(e.target.value); setChatPage(1) }}
              />
            </div>

            <div className="card-body-0">
              {chatEntries.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No chat messages</div>
                  <div className="empty-state-desc">
                    Chat data will appear here once the RCON event persister is active.
                  </div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Player</th>
                      <th>Channel</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chatEntries.map((e) => (
                      <tr key={e.id}>
                        <td className="mono" style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          {new Date(e.createdAt).toLocaleString()}
                        </td>
                        <td className="bright">{e.displayName}</td>
                        <td>
                          <span className={`pill ${CHANNEL_COLORS[e.channel] ?? 'pill-muted'}`} style={{ fontSize: '9px' }}>
                            {e.channel}
                          </span>
                        </td>
                        <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {chatTotalPages > 1 && (
              <div className="card-footer" style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px' }}>
                <button className="btn btn-ghost btn-sm" disabled={chatPage <= 1} onClick={() => setChatPage((p) => p - 1)}>
                  Prev
                </button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', alignSelf: 'center' }}>
                  {chatPage} / {chatTotalPages}
                </span>
                <button className="btn btn-ghost btn-sm" disabled={chatPage >= chatTotalPages} onClick={() => setChatPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
