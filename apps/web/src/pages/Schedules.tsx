import { useState, useEffect, useCallback, useRef } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import EmptyState from '../components/ui/EmptyState.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { api } from '../api/client.js'

type ScheduledTask = {
  id: string
  slug: string
  label: string
  type: string
  cronExpr: string
  payload: string | null
  enabled: boolean
  nextRun: string | null
  lastRun: string | null
}

type CronFreq = 'daily' | 'weekly' | 'monthly' | 'custom'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function buildCron(
  freq: CronFreq,
  hour: number,
  minute: number,
  weekday: number,
  monthDay: number,
  custom: string
): string {
  if (freq === 'daily') return `${minute} ${hour} * * *`
  if (freq === 'weekly') return `${minute} ${hour} * * ${weekday}`
  if (freq === 'monthly') return `${minute} ${hour} ${monthDay} * *`
  return custom.trim() || '0 6 * * *'
}

function friendlyScheduleDesc(
  freq: CronFreq,
  hour: number,
  minute: number,
  weekday: number,
  monthDay: number
): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  const time = `${hh}:${mm}`
  if (freq === 'daily') return `Every day at ${time}`
  if (freq === 'weekly') return `Every ${WEEKDAY_NAMES[weekday] ?? 'weekday'} at ${time}`
  if (freq === 'monthly') return `Every month on the ${ordinal(monthDay)} at ${time}`
  return 'Custom schedule'
}

const typeColor: Record<string, string> = {
  COMMAND: 'pill-green',
  RESTART: 'pill-orange',
}

const SCHEDULE_COMMANDS = [
  {
    value: 'forcesave',
    label: 'Force Save',
    desc: 'Immediately saves all world and player data to disk.',
    hasParam: false,
  },
  {
    value: 'settime',
    label: 'Set Time',
    desc: 'Sets the in-game time of day. Value is a number from 0 (midnight) to 24 (next midnight). Example: 12 = noon, 6 = sunrise.',
    hasParam: true,
    paramLabel: 'Time (0\u201324)',
    paramPlaceholder: '12',
  },
  {
    value: 'setweather',
    label: 'Set Weather',
    desc: 'Changes the current weather condition. Available options: Clear, Rain, Storm, Fog.',
    hasParam: true,
    paramLabel: 'Weather',
    paramPlaceholder: 'Clear',
    paramOptions: ['Clear', 'Rain', 'Storm', 'Fog'],
  },
  {
    value: 'forcerespawnloot',
    label: 'Force Respawn Loot',
    desc: 'Immediately respawns all loot containers across the map. Useful after a scheduled restart or for events.',
    hasParam: false,
  },
  {
    value: 'announcement',
    label: 'Announcement',
    desc: 'Broadcasts a message to all connected players in the in-game chat. Use for maintenance warnings, event notifications, etc.',
    hasParam: true,
    paramLabel: 'Message',
    paramPlaceholder: 'Server restarting in 5 minutes!',
  },
] as const

export default function Schedules() {
  const { activeServer } = useServer()
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add form state
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<'COMMAND' | 'RESTART'>('COMMAND')
  const [newFreq, setNewFreq] = useState<CronFreq>('daily')
  const [newHour, setNewHour] = useState(6)
  const [newMinute, setNewMinute] = useState(0)
  const [newWeekday, setNewWeekday] = useState(1)
  const [newMonthDay, setNewMonthDay] = useState(1)
  const [newCustomCron, setNewCustomCron] = useState('')
  const [newCommand, setNewCommand] = useState<string>('forcesave')
  const [newParam, setNewParam] = useState('')
  const [newEnabled, setNewEnabled] = useState(true)

  const addModalRef = useRef<HTMLDivElement>(null)

  // Focus trap for add modal
  useEffect(() => {
    if (!showAdd) return
    const modal = addModalRef.current
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
  }, [showAdd])

  const load = useCallback(() => {
    if (!activeServer?.serverName) return
    setLoading(true)
    api
      .get<ScheduledTask[]>(`/servers/${activeServer.serverName}/schedules`)
      .then(setTasks)
      .catch((e) => setError((e as Error).message || 'Failed to load schedules'))
      .finally(() => setLoading(false))
  }, [activeServer?.serverName])

  useEffect(() => {
    if (activeServer?.serverName) load()
  }, [activeServer?.serverName, load])

  const toggleEnabled = (task: ScheduledTask) => {
    if (!activeServer?.serverName) return
    api
      .put(`/servers/${activeServer.serverName}/schedules/${task.slug}`, { enabled: !task.enabled })
      .then(load)
      .catch((e) => setError((e as Error).message || 'Failed to update schedule'))
  }

  const deleteTask = (slug: string) => {
    if (!activeServer?.serverName) return
    api
      .delete(`/servers/${activeServer.serverName}/schedules/${slug}`)
      .then(load)
      .catch((e) => setError((e as Error).message || 'Failed to delete task'))
  }

  const runNow = (slug: string) => {
    if (!activeServer?.serverName) return
    api
      .post(`/servers/${activeServer.serverName}/schedules/${slug}/run`)
      .then(load)
      .catch((e) => setError(`Failed to trigger task: ${(e as Error).message}`))
  }

  const resetAddForm = () => {
    setNewLabel('')
    setNewType('COMMAND')
    setNewFreq('daily')
    setNewHour(6)
    setNewMinute(0)
    setNewWeekday(1)
    setNewMonthDay(1)
    setNewCustomCron('')
    setNewCommand('forcesave')
    setNewParam('')
    setNewEnabled(true)
  }

  const createTask = () => {
    if (!activeServer?.serverName || !newLabel.trim()) return
    const cronExpr = buildCron(newFreq, newHour, newMinute, newWeekday, newMonthDay, newCustomCron)
    api
      .post(`/servers/${activeServer.serverName}/schedules`, {
        label: newLabel.trim(),
        type: newType,
        cronExpr,
        payload: newType === 'COMMAND'
          ? (() => {
              const cmd = SCHEDULE_COMMANDS.find(c => c.value === newCommand)
              if (!cmd) return newCommand
              return cmd.hasParam && newParam ? `${cmd.value} ${newParam}` : cmd.value
            })()
          : null,
        enabled: newEnabled,
      })
      .then(() => {
        setShowAdd(false)
        resetAddForm()
        load()
      })
      .catch((e) => setError(`Failed to create task: ${(e as Error).message}`))
  }

  const activeCount = tasks.filter((s) => s.enabled).length
  const paused = tasks.filter((s) => !s.enabled).length

  const schedulePreview = newFreq !== 'custom'
    ? friendlyScheduleDesc(newFreq, newHour, newMinute, newWeekday, newMonthDay)
    : newCustomCron.trim() || '—'

  return (
    <div className="main fadein">
      <PageHeader
        title="Schedules"
        subtitle="Cron-based tasks · command · restart"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Add Schedule
          </button>
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

      {/* ── Add Schedule Modal ────────────────────────────────── */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div
            ref={addModalRef}
            className="modal fadein"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-schedule-modal-title"
          >
            <div className="card-header">
              <span className="card-title" id="add-schedule-modal-title">New Scheduled Task</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setShowAdd(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div
              className="card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              {/* Label */}
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="sched-label" className="setting-info">
                  <div className="setting-name">Label</div>
                </label>
                <input
                  id="sched-label"
                  className="text-input"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Daily Restart"
                />
              </div>

              {/* Type */}
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="sched-type" className="setting-info">
                  <div className="setting-name">Type</div>
                </label>
                <select
                  id="sched-type"
                  className="sel-input"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as 'COMMAND' | 'RESTART')}
                >
                  <option value="COMMAND">Command</option>
                  <option value="RESTART">Restart</option>
                </select>
              </div>

              {/* Frequency */}
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="sched-freq" className="setting-info">
                  <div className="setting-name">Frequency</div>
                </label>
                <select
                  id="sched-freq"
                  className="sel-input"
                  value={newFreq}
                  onChange={(e) => setNewFreq(e.target.value as CronFreq)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Weekday (weekly only) */}
              {newFreq === 'weekly' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <label htmlFor="sched-weekday" className="setting-info">
                    <div className="setting-name">Day of Week</div>
                  </label>
                  <select
                    id="sched-weekday"
                    className="sel-input"
                    value={newWeekday}
                    onChange={(e) => setNewWeekday(Number(e.target.value))}
                  >
                    {WEEKDAY_NAMES.map((name, i) => (
                      <option key={name} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Day of month (monthly only) */}
              {newFreq === 'monthly' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <label htmlFor="sched-monthday" className="setting-info">
                    <div className="setting-name">Day of Month</div>
                    <div className="setting-desc">1–28</div>
                  </label>
                  <input
                    id="sched-monthday"
                    className="num-input"
                    type="number"
                    min={1}
                    max={28}
                    value={newMonthDay}
                    onChange={(e) => setNewMonthDay(Math.min(28, Math.max(1, Number(e.target.value))))}
                    aria-label="Day of month"
                  />
                </div>
              )}

              {/* Hour + Minute (daily / weekly / monthly) */}
              {newFreq !== 'custom' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <div className="setting-info">
                    <div className="setting-name">Time (UTC)</div>
                    <div className="setting-desc">Hour (0–23) and minute (0–59)</div>
                  </div>
                  <div className="row" style={{ gap: '8px' }}>
                    <input
                      className="num-input"
                      type="number"
                      min={0}
                      max={23}
                      value={newHour}
                      onChange={(e) => setNewHour(Math.min(23, Math.max(0, Number(e.target.value))))}
                      aria-label="Hour"
                      style={{ width: '72px' }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: '13px',
                        color: 'var(--muted)',
                        lineHeight: '32px',
                      }}
                    >
                      :
                    </span>
                    <input
                      className="num-input"
                      type="number"
                      min={0}
                      max={59}
                      value={newMinute}
                      onChange={(e) => setNewMinute(Math.min(59, Math.max(0, Number(e.target.value))))}
                      aria-label="Minute"
                      style={{ width: '72px' }}
                    />
                  </div>
                </div>
              )}

              {/* Custom cron */}
              {newFreq === 'custom' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <label htmlFor="sched-cron" className="setting-info">
                    <div className="setting-name">Cron Expression</div>
                    <div className="setting-desc">min hour dom month dow — e.g. 0 6 * * 1</div>
                  </label>
                  <input
                    id="sched-cron"
                    className="text-input"
                    value={newCustomCron}
                    onChange={(e) => setNewCustomCron(e.target.value)}
                    placeholder="0 6 * * *"
                  />
                </div>
              )}

              {/* Schedule preview */}
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--muted)',
                }}
              >
                {schedulePreview}
              </div>

              {/* Command (COMMAND only) */}
              {newType === 'COMMAND' && (
                <>
                  <div className="setting-row" style={{ padding: 0 }}>
                    <label htmlFor="sched-command" className="setting-info">
                      <div className="setting-name">Command</div>
                    </label>
                    <select
                      id="sched-command"
                      className="sel-input"
                      value={newCommand}
                      onChange={(e) => { setNewCommand(e.target.value); setNewParam('') }}
                    >
                      {SCHEDULE_COMMANDS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Parameter input (if command needs one) */}
                  {(() => {
                    const cmd = SCHEDULE_COMMANDS.find(c => c.value === newCommand)
                    if (!cmd?.hasParam) return null
                    return (
                      <div className="setting-row" style={{ padding: 0 }}>
                        <label htmlFor="sched-param" className="setting-info">
                          <div className="setting-name">{cmd.paramLabel}</div>
                        </label>
                        {'paramOptions' in cmd && cmd.paramOptions ? (
                          <select
                            id="sched-param"
                            className="sel-input"
                            value={newParam}
                            onChange={(e) => setNewParam(e.target.value)}
                          >
                            <option value="">Select...</option>
                            {cmd.paramOptions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id="sched-param"
                            className="text-input"
                            value={newParam}
                            onChange={(e) => setNewParam(e.target.value)}
                            placeholder={cmd.paramPlaceholder}
                          />
                        )}
                      </div>
                    )
                  })()}

                  {/* Command info panel */}
                  <div style={{
                    padding: '10px 14px',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: 'var(--muted)',
                    lineHeight: '1.5',
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-bright)', marginBottom: '4px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                      {SCHEDULE_COMMANDS.find(c => c.value === newCommand)?.label}
                    </div>
                    {SCHEDULE_COMMANDS.find(c => c.value === newCommand)?.desc}
                  </div>
                </>
              )}

              {/* Enable immediately */}
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Enable immediately</div>
                </div>
                <button
                  className={`toggle ${newEnabled ? 'on' : ''}`}
                  role="switch"
                  aria-checked={newEnabled}
                  aria-label="Enable immediately"
                  onClick={() => setNewEnabled((p) => !p)}
                />
              </div>

              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={createTask}
                  disabled={
                    !newLabel.trim() ||
                    (newType === 'COMMAND' && (() => {
                      const cmd = SCHEDULE_COMMANDS.find(c => c.value === newCommand)
                      return !!(cmd?.hasParam && !newParam.trim())
                    })()) ||
                    (newFreq === 'custom' && !newCustomCron.trim())
                  }
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Scheduled Tasks</span>
          <span className="card-meta">
            {activeCount} active · {paused} paused
          </span>
        </div>
        <div className="card-body-0">
          {loading ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--dim)',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
              }}
            >
              Loading…
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState
              icon="◷"
              title="No scheduled tasks"
              desc="Add a scheduled command or restart."
            />
          ) : (
            <div
              style={{
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {tasks.map((s) => (
                <div key={s.id} className={`task-card${!s.enabled ? ' disabled' : ''}`}>
                  <div className="row">
                    <span
                      style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '13px' }}
                    >
                      {s.label}
                    </span>
                    <span
                      className={`pill ${s.enabled ? 'pill-green' : 'pill-muted'}`}
                      style={{ fontSize: '10px' }}
                    >
                      {s.enabled ? 'Enabled' : 'Paused'}
                    </span>
                    <span
                      className={`pill ${typeColor[s.type] ?? 'pill-muted'}`}
                      style={{ fontSize: '10px' }}
                    >
                      {s.type}
                    </span>
                    <div className="spacer" />
                    <button className="btn btn-ghost btn-xs" onClick={() => runNow(s.slug)}>
                      Run Now
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => toggleEnabled(s)}>
                      {s.enabled ? 'Pause' : 'Enable'}
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => deleteTask(s.slug)}>
                      Delete
                    </button>
                  </div>
                  <div className="task-meta">
                    {(
                      [
                        ['Payload', s.payload ?? '—'],
                        [
                          'Next Run',
                          s.nextRun ? new Date(s.nextRun).toLocaleString() : '—',
                        ],
                        [
                          'Last Run',
                          s.lastRun ? new Date(s.lastRun).toLocaleString() : '—',
                        ],
                      ] as [string, string][]
                    ).map(([k, v]) => (
                      <div key={k} className="task-meta-item">
                        <div className="task-meta-label">{k}</div>
                        <div className="task-meta-value">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--dim)',
                  fontSize: '11px',
                  padding: '8px',
                  fontFamily: 'var(--mono)',
                }}
              >
                COMMAND tasks dispatch the payload as a console command. RESTART tasks restart the container.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
