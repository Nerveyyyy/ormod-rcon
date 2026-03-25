import { useState, useEffect } from 'react'
import { api } from '../../api/client.js'
import ConfirmDialog from './ConfirmDialog.js'

// ── Types ────────────────────────────────────────────────────────────────────

type PlayerPanelProps = {
  steamId: string
  serverName: string
  online?: boolean
  onClose: () => void
}

interface PlayerDetail {
  steamId: string
  displayName: string
  firstSeen: string
  lastSeen: string
  kills: number
  deaths: number
  serverStats?: Array<{
    totalTime: number
    firstSeen: string
    lastSeen: string
    notes: string | null
    server: { serverName: string }
  }>
}

interface Session {
  id: string
  joinedAt: string
  leftAt: string | null
  duration: number | null
  reason: string | null
}

interface SessionsResponse {
  data: Session[]
  page: number
  limit: number
  total: number
}

interface CombatEntry {
  id: string
  createdAt: string
  cause: string
  weapon: string | null
  killerSteamId: string | null
  killerDisplayName: string | null
  player: { steamId: string; displayName: string }
}

interface CombatResponse {
  data: CombatEntry[]
  page: number
  limit: number
  total: number
}

interface AuditEntry {
  id: string
  createdAt: string
  action: string
  performedBy: string | null
  reason: string | null
  source: string | null
}

interface AuditResponse {
  data: AuditEntry[]
  page: number
  limit: number
  total: number
}

interface AccessList {
  slug: string
  name: string
  type: string
}

interface ListEntry {
  listSlug: string
  listName: string
  listType: string
  scope: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function fmtDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ACTION_PILL: Record<string, string> = {
  BAN: 'pill-red',
  KICK: 'pill-orange',
  WHITELIST: 'pill-green',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayerPanel({ steamId, serverName, online, onClose }: PlayerPanelProps) {
  const TABS = ['overview', 'sessions', 'combat', 'audit'] as const
  type Tab = typeof TABS[number]

  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // ── Overview ──────────────────────────────────────────────────────────────
  const [player, setPlayer] = useState<PlayerDetail | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  // ── Sessions ──────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionPage, setSessionPage] = useState(1)
  const [sessionTotal, setSessionTotal] = useState(0)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)

  // ── Combat ────────────────────────────────────────────────────────────────
  const [combat, setCombat] = useState<CombatEntry[]>([])
  const [combatPage, setCombatPage] = useState(1)
  const [combatTotal, setCombatTotal] = useState(0)
  const [combatLoading, setCombatLoading] = useState(false)
  const [combatError, setCombatError] = useState<string | null>(null)

  // ── Audit ─────────────────────────────────────────────────────────────────
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  // ── Access lists ──────────────────────────────────────────────────────────
  const [playerLists, setPlayerLists] = useState<ListEntry[]>([])
  const [allLists, setAllLists] = useState<AccessList[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  // ── Moderate ──────────────────────────────────────────────────────────────
  const [moderateOpen, setModerateOpen] = useState(false)
  const [banSlug, setBanSlug] = useState('')
  const [banReason, setBanReason] = useState('')
  const [kickReason, setKickReason] = useState('')
  const [whitelistSlug, setWhitelistSlug] = useState('')

  const [pendingModerate, setPendingModerate] = useState(false)
  const [moderateError, setModerateError] = useState<string | null>(null)
  const [moderateSuccess, setModerateSuccess] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{
    action: string
    label: string
    reasonField?: boolean
    fn: (reason?: string) => Promise<void>
  } | null>(null)

  // ── Fetch: overview ───────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'overview') return
    setOverviewLoading(true)
    setOverviewError(null)
    api
      .get<PlayerDetail>(`/players/${steamId}`)
      .then(setPlayer)
      .catch((e) => setOverviewError((e as Error).message))
      .finally(() => setOverviewLoading(false))
  }, [activeTab, steamId])

  // ── Fetch: sessions ───────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'sessions') return
    setSessionsLoading(true)
    setSessionsError(null)
    api
      .get<SessionsResponse>(
        `/servers/${serverName}/sessions?steamId=${steamId}&limit=20&page=${sessionPage}`
      )
      .then((res) => {
        setSessions(res.data)
        setSessionTotal(res.total)
      })
      .catch((e) => setSessionsError((e as Error).message))
      .finally(() => setSessionsLoading(false))
  }, [activeTab, steamId, serverName, sessionPage])

  // ── Fetch: combat ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'combat') return
    setCombatLoading(true)
    setCombatError(null)
    api
      .get<CombatResponse>(
        `/servers/${serverName}/combat-log?steamId=${steamId}&limit=20&page=${combatPage}`
      )
      .then((res) => {
        setCombat(res.data)
        setCombatTotal(res.total)
      })
      .catch((e) => setCombatError((e as Error).message))
      .finally(() => setCombatLoading(false))
  }, [activeTab, steamId, serverName, combatPage])

  // ── Fetch: audit ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'audit') return
    setAuditLoading(true)
    setAuditError(null)
    api
      .get<AuditResponse>(`/players/${steamId}/audit?limit=20&page=${auditPage}`)
      .then((res) => {
        setAudit(res.data)
        setAuditTotal(res.total)
      })
      .catch((e) => setAuditError((e as Error).message))
      .finally(() => setAuditLoading(false))
  }, [activeTab, steamId, auditPage])

  // ── Fetch: player lists (once on open) ───────────────────────────────────
  useEffect(() => {
    api
      .get<ListEntry[]>(`/players/${steamId}/lists`)
      .then(setPlayerLists)
      .catch(() => {})
  }, [steamId])

  // ── Fetch: all lists (on moderate expand) ────────────────────────────────
  useEffect(() => {
    if (!moderateOpen || listsLoaded) return
    api
      .get<AccessList[]>('/lists')
      .then((res) => {
        setAllLists(res)
        setListsLoaded(true)
        const firstBan = res.find((l) => l.type === 'BAN')
        if (firstBan) setBanSlug(firstBan.slug)
        const firstWl = res.find((l) => l.type === 'WHITELIST')
        if (firstWl) setWhitelistSlug(firstWl.slug)
      })
      .catch(() => {})
  }, [moderateOpen, listsLoaded, steamId])

  const banLists = allLists.filter((l) => l.type === 'BAN')
  const whitelistLists = allLists.filter((l) => l.type === 'WHITELIST')

  // ── Moderate actions ──────────────────────────────────────────────────────
  async function execModerate(action: () => Promise<void>, successMsg: string) {
    setPendingModerate(true)
    setModerateError(null)
    setModerateSuccess(null)
    try {
      await action()
      setModerateSuccess(successMsg)
      api.get<ListEntry[]>(`/players/${steamId}/lists`).then(setPlayerLists).catch(() => {})
      setTimeout(() => setModerateSuccess(null), 4000)
    } catch (e) {
      setModerateError((e as Error).message)
      setTimeout(() => setModerateError(null), 5000)
    } finally {
      setPendingModerate(false)
    }
  }

  async function doRemoveFromList(listSlug: string) {
    setRemoveError(null)
    try {
      await api.delete(`/lists/${listSlug}/entries/${steamId}`)
      setPlayerLists((prev) => prev.filter((e) => e.listSlug !== listSlug))
    } catch (e) {
      setRemoveError((e as Error).message)
    }
  }

  async function doBan() {
    await execModerate(
      () => api.post(`/lists/${banSlug}/entries`, { steamId, reason: banReason }),
      'Player banned.'
    )
    setBanReason('')
  }

  async function doKick(reason?: string) {
    await execModerate(
      () => api.post(`/servers/${serverName}/players/${steamId}/kick`, { reason: reason || kickReason }),
      'Player kicked.'
    )
    setKickReason('')
  }

  async function doWhitelist() {
    await execModerate(
      () => api.post(`/lists/${whitelistSlug}/entries`, { steamId }),
      'Player whitelisted.'
    )
  }


  // ── Pagination helpers ────────────────────────────────────────────────────
  const sessionPages = Math.ceil(sessionTotal / 20)
  const combatPages = Math.ceil(combatTotal / 20)
  const auditPages = Math.ceil(auditTotal / 20)

  // ── Derived stats ─────────────────────────────────────────────────────────
  const serverStat = player?.serverStats?.find((s) => s.server.serverName === serverName)
  const totalTime = serverStat?.totalTime ?? 0
  const kd =
    player
      ? player.deaths === 0
        ? player.kills > 0
          ? player.kills.toString()
          : '—'
        : (player.kills / player.deaths).toFixed(2)
      : '—'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="slide-panel-overlay" onClick={onClose} />
      <div className="slide-panel">

        {/* Header */}
        <div className="slide-panel-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                className={`pill ${online ? 'pill-green' : 'pill-muted'}`}
                style={{ fontSize: '9px' }}
              >
                {online ? 'Online' : 'Offline'}
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--dim)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {steamId}
              </span>
            </div>
            <div
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-bright)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {player?.displayName ?? steamId}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              {serverName}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close panel"
            style={{ flexShrink: 0, alignSelf: 'flex-start' }}
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="slide-panel-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`slide-panel-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="slide-panel-body">

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div>
              {overviewLoading && (
                <div className="empty-state">
                  <div className="empty-state-title">Loading...</div>
                </div>
              )}
              {overviewError && (
                <div className="error-banner" role="alert">{overviewError}</div>
              )}
              {!overviewLoading && !overviewError && player && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Stats grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                    }}
                  >
                    {[
                      { label: 'Playtime', value: fmtPlaytime(totalTime) },
                      { label: 'K/D', value: kd },
                      { label: 'Kills', value: String(player.kills) },
                      { label: 'Deaths', value: String(player.deaths) },
                      { label: 'First Seen', value: fmtDate(serverStat?.firstSeen ?? player.firstSeen) },
                      { label: 'Last Seen', value: fmtDate(serverStat?.lastSeen ?? player.lastSeen) },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        style={{
                          background: 'var(--bg2)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          padding: '10px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--mono)',
                            color: 'var(--muted)',
                            marginBottom: '4px',
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            fontFamily: 'var(--mono)',
                            color: 'var(--text-bright)',
                            wordBreak: 'break-all',
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Moderation section (between stats and notes) ── */}
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      background: 'var(--bg0)',
                    }}
                  >
                    {/* Current lists */}
                    {playerLists.length > 0 && (
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                        <div
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--mono)',
                            color: 'var(--muted)',
                            marginBottom: '6px',
                          }}
                        >
                          Current Lists
                        </div>
                        {removeError && (
                          <div className="error-banner" role="alert" style={{ marginBottom: '6px', fontSize: '11px' }}>
                            {removeError}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {playerLists.map((entry) => (
                            <div
                              key={entry.listSlug}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '4px 0',
                              }}
                            >
                              <span
                                style={{ flex: 1, fontSize: '12px', color: 'var(--text-bright)' }}
                              >
                                {entry.listName}
                              </span>
                              <span
                                className={`pill ${ACTION_PILL[entry.listType] ?? 'pill-muted'}`}
                                style={{ fontSize: '9px' }}
                              >
                                {entry.listType}
                              </span>
                              {entry.scope && (
                                <span className="pill pill-muted" style={{ fontSize: '9px' }}>
                                  {entry.scope}
                                </span>
                              )}
                              <button
                                className="btn btn-ghost btn-xs"
                                style={{ color: 'var(--red)' }}
                                onClick={() => doRemoveFromList(entry.listSlug)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Toggle moderate */}
                    <button
                      className="btn btn-ghost"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '12px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: moderateOpen ? 'var(--orange)' : 'var(--text-bright)',
                        borderBottom: moderateOpen ? '1px solid var(--border)' : 'none',
                        borderRadius: 0,
                      }}
                      onClick={() => setModerateOpen((o) => !o)}
                    >
                      {moderateOpen ? '▾ Hide Moderation' : '▸ Moderate Player'}
                    </button>

                    {moderateOpen && (
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {moderateError && (
                          <div className="error-banner" role="alert" style={{ fontSize: '11px' }}>
                            {moderateError}
                          </div>
                        )}
                        {moderateSuccess && (
                          <div className="info-banner" role="status" style={{ fontSize: '11px' }}>
                            {moderateSuccess}
                          </div>
                        )}

                        {/* Ban */}
                        <div
                          style={{
                            background: 'var(--bg2)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--red)' }}>
                            Ban
                          </div>
                          {banLists.length === 0 ? (
                            <div style={{ fontSize: '11px', color: 'var(--dim)' }}>No ban lists configured.</div>
                          ) : (
                            <>
                              <select
                                className="text-input"
                                style={{ fontSize: '12px' }}
                                value={banSlug}
                                onChange={(e) => setBanSlug(e.target.value)}
                              >
                                {banLists.map((l) => (
                                  <option key={l.slug} value={l.slug}>{l.name}</option>
                                ))}
                              </select>
                              <input
                                className="text-input"
                                style={{ fontSize: '12px' }}
                                placeholder="Reason (required)"
                                value={banReason}
                                onChange={(e) => setBanReason(e.target.value)}
                              />
                              <button
                                className="btn btn-danger btn-sm"
                                disabled={pendingModerate || !banReason.trim()}
                                onClick={() =>
                                  setConfirm({
                                    action: 'ban',
                                    label: 'Ban Player',
                                    fn: doBan,
                                  })
                                }
                              >
                                Ban
                              </button>
                            </>
                          )}
                        </div>

                        {/* Kick */}
                        <div
                          style={{
                            background: 'var(--bg2)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--orange)' }}>
                            Kick
                          </div>
                          <input
                            className="text-input"
                            style={{ fontSize: '12px' }}
                            placeholder="Reason (required)"
                            value={kickReason}
                            onChange={(e) => setKickReason(e.target.value)}
                          />
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--orange)' }}
                            disabled={pendingModerate || !kickReason.trim()}
                            onClick={() =>
                              setConfirm({
                                action: 'kick',
                                label: 'Kick Player',
                                fn: () => doKick(kickReason),
                              })
                            }
                          >
                            Kick
                          </button>
                        </div>

                        {/* Whitelist */}
                        <div
                          style={{
                            background: 'var(--bg2)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                            Whitelist
                          </div>
                          {whitelistLists.length === 0 ? (
                            <div style={{ fontSize: '11px', color: 'var(--dim)' }}>No whitelist lists configured.</div>
                          ) : (
                            <>
                              <select
                                className="text-input"
                                style={{ fontSize: '12px' }}
                                value={whitelistSlug}
                                onChange={(e) => setWhitelistSlug(e.target.value)}
                              >
                                {whitelistLists.map((l) => (
                                  <option key={l.slug} value={l.slug}>{l.name}</option>
                                ))}
                              </select>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--green)' }}
                                disabled={pendingModerate}
                                onClick={() =>
                                  setConfirm({
                                    action: 'whitelist',
                                    label: 'Whitelist Player',
                                    fn: doWhitelist,
                                  })
                                }
                              >
                                Whitelist
                              </button>
                            </>
                          )}
                        </div>

                      </div>
                    )}
                  </div>

                  {/* Admin notes */}
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--mono)',
                        color: 'var(--muted)',
                        marginBottom: '6px',
                      }}
                    >
                      Admin Notes
                    </div>
                    <textarea
                      className="text-input"
                      readOnly
                      rows={4}
                      style={{ width: '100%', resize: 'vertical', fontSize: '12px' }}
                      value={serverStat?.notes ?? ''}
                      placeholder="No notes."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Sessions ── */}
          {activeTab === 'sessions' && (
            <div>
              {sessionsLoading && (
                <div className="empty-state">
                  <div className="empty-state-title">Loading...</div>
                </div>
              )}
              {sessionsError && (
                <div className="error-banner" role="alert">{sessionsError}</div>
              )}
              {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-title">No session history</div>
                </div>
              )}
              {!sessionsLoading && !sessionsError && sessions.length > 0 && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Joined</th>
                        <th>Left</th>
                        <th>Duration</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td className="mono" style={{ fontSize: '11px' }}>
                            {fmtShort(s.joinedAt)}
                          </td>
                          <td className="mono" style={{ fontSize: '11px' }}>
                            {s.leftAt ? fmtShort(s.leftAt) : '—'}
                          </td>
                          <td className="mono" style={{ fontSize: '11px' }}>
                            {fmtDuration(s.duration)}
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--dim)' }}>
                            {s.reason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sessionPages > 1 && (
                    <PaginationBar
                      page={sessionPage}
                      total={sessionPages}
                      onPrev={() => setSessionPage((p) => p - 1)}
                      onNext={() => setSessionPage((p) => p + 1)}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Combat ── */}
          {activeTab === 'combat' && (
            <div>
              {combatLoading && (
                <div className="empty-state">
                  <div className="empty-state-title">Loading...</div>
                </div>
              )}
              {combatError && (
                <div className="error-banner" role="alert">{combatError}</div>
              )}
              {!combatLoading && !combatError && combat.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-title">No combat history</div>
                </div>
              )}
              {!combatLoading && !combatError && combat.length > 0 && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Cause</th>
                        <th>Killer</th>
                        <th>Weapon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combat.map((c) => (
                        <tr key={c.id} className="combat-row-pvp">
                          <td className="mono" style={{ fontSize: '11px' }}>
                            {fmtShort(c.createdAt)}
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--red)' }}>
                            {c.cause}
                          </td>
                          <td
                            className="mono"
                            style={{ fontSize: '11px', color: 'var(--dim)' }}
                          >
                            {c.killerDisplayName ?? c.killerSteamId ?? '—'}
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--dim)' }}>
                            {c.weapon ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {combatPages > 1 && (
                    <PaginationBar
                      page={combatPage}
                      total={combatPages}
                      onPrev={() => setCombatPage((p) => p - 1)}
                      onNext={() => setCombatPage((p) => p + 1)}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Audit ── */}
          {activeTab === 'audit' && (
            <div>
              {auditLoading && (
                <div className="empty-state">
                  <div className="empty-state-title">Loading...</div>
                </div>
              )}
              {auditError && (
                <div className="error-banner" role="alert">{auditError}</div>
              )}
              {!auditLoading && !auditError && audit.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-title">No audit history</div>
                </div>
              )}
              {!auditLoading && !auditError && audit.length > 0 && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Performed By</th>
                        <th>Reason</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((a) => (
                        <tr key={a.id}>
                          <td className="mono" style={{ fontSize: '11px' }}>
                            {fmtShort(a.createdAt)}
                          </td>
                          <td>
                            <span
                              className={`pill ${ACTION_PILL[a.action] ?? 'pill-muted'}`}
                              style={{ fontSize: '9px' }}
                            >
                              {a.action}
                            </span>
                          </td>
                          <td
                            className="mono"
                            style={{ fontSize: '11px', color: 'var(--dim)' }}
                          >
                            {a.performedBy ?? '—'}
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--dim)' }}>
                            {a.reason ?? '—'}
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--dim)' }}>
                            {a.source ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {auditPages > 1 && (
                    <PaginationBar
                      page={auditPage}
                      total={auditPages}
                      onPrev={() => setAuditPage((p) => p - 1)}
                      onNext={() => setAuditPage((p) => p + 1)}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          title={confirm.label}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const fn = confirm.fn
            setConfirm(null)
            await fn()
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Are you sure you want to {confirm.label.toLowerCase()}{' '}
            <strong style={{ color: 'var(--text-bright)' }}>
              {player?.displayName ?? steamId}
            </strong>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--dim)', marginLeft: '4px' }}>
              ({steamId})
            </span>
            ?
          </div>
        </ConfirmDialog>
      )}
    </>
  )
}

// ── Pagination bar ────────────────────────────────────────────────────────────

function PaginationBar({
  page,
  total,
  onPrev,
  onNext,
}: {
  page: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', paddingTop: '12px' }}>
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={onPrev}>
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
        {page} / {total}
      </span>
      <button className="btn btn-ghost btn-sm" disabled={page >= total} onClick={onNext}>
        Next
      </button>
    </div>
  )
}
