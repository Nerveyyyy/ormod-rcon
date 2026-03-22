import { useState, useEffect, useCallback, useRef } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { SERVER_SETTING_GROUPS } from '../lib/constants.js'
import type { Setting } from '../lib/constants.js'
import { api } from '../api/client.js'

type SettingValue = string | number | boolean
type BulkSaveState = 'idle' | 'saving' | 'saved'

/**
 * Settings currently available in the playtest via setserversetting.
 * Everything else is greyed out until the full release.
 * Remove this set (and the checks below) once all commands are enabled.
 */
const AVAILABLE_SETTINGS = new Set([
  'IsOnline',
  'FriendsOnly',
  'WorldRobotDensity',
  'RobotPlating',
  'RobotDifficulty',
  'SkuttlerSpeed',
  'SkuttlerNightSpeed',
])

/** .NET DateTime ticks → JS Date. Ticks are 100ns intervals since 0001-01-01. */
function ticksToDate(ticks: number): Date {
  // .NET epoch offset from Unix epoch in milliseconds
  const TICKS_AT_UNIX_EPOCH = 621355968000000000
  return new Date((ticks - TICKS_AT_UNIX_EPOCH) / 10000)
}

const TICK_FIELDS = new Set(['LastPlayedTime', 'ServerWipeTime'])

const TAB_ABBRS: Record<string, string> = {
  General: 'GEN',
  Server: 'SRV',
  World: 'WLD',
  Environment: 'ENV',
  Structures: 'STR',
  Loot: 'LOT',
  Machines: 'MCH',
  Weather: 'WTH',
  Trader: 'TRD',
  Player: 'PLR',
}

function tryParseSettings(raw: string): Record<string, unknown> | null {
  // Attempt 1: JSON
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }

  // Attempt 2: line-by-line Key: value or Key=value
  const result: Record<string, unknown> = {}
  let matched = 0
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(': ')
    const equalsIdx = trimmed.indexOf('=')
    let key: string | undefined
    let rawVal: string | undefined
    if (colonIdx !== -1) {
      key = trimmed.slice(0, colonIdx).trim()
      rawVal = trimmed.slice(colonIdx + 2).trim()
    } else if (equalsIdx !== -1) {
      key = trimmed.slice(0, equalsIdx).trim()
      rawVal = trimmed.slice(equalsIdx + 1).trim()
    }
    if (!key || rawVal === undefined) continue
    if (rawVal === 'true') result[key] = true
    else if (rawVal === 'false') result[key] = false
    else if (rawVal !== '' && !isNaN(Number(rawVal))) result[key] = Number(rawVal)
    else result[key] = rawVal
    matched++
  }
  return matched > 0 ? result : null
}

function defaultVals(): Record<string, SettingValue> {
  return SERVER_SETTING_GROUPS.flatMap((g) => g.settings).reduce<Record<string, SettingValue>>(
    (acc, s) => ({ ...acc, [s.key]: s.value }),
    {}
  )
}

function SettingInput({
  s,
  value,
  disabled,
  onChange,
}: {
  s: Setting
  value: SettingValue
  disabled: boolean
  onChange: (v: SettingValue) => void
}) {
  if (s.type === 'bool') {
    return (
      <div className="toggle-wrap">
        <span
          className="toggle-val"
          style={{ color: value ? 'var(--green)' : 'var(--dim)' }}
        >
          {value ? 'true' : 'false'}
        </span>
        <button
          className={`toggle ${value ? 'on' : ''}`}
          role="switch"
          aria-checked={value as boolean}
          aria-label={s.name}
          disabled={disabled}
          onClick={() => onChange(!value)}
        />
      </div>
    )
  }
  if (s.type === 'number') {
    return (
      <input
        className="num-input"
        type="number"
        value={value as number}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={s.name}
        disabled={disabled}
      />
    )
  }
  if (s.type === 'select') {
    return (
      <select
        className="sel-input"
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        aria-label={s.name}
        disabled={disabled}
      >
        {s.options?.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    )
  }
  if (s.type === 'text') {
    return (
      <input
        className="text-input"
        type="text"
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        aria-label={s.name}
        disabled={disabled}
      />
    )
  }
  // readonly — format .NET tick fields as human-readable dates
  if (TICK_FIELDS.has(s.key) && typeof value === 'number' && value > 0) {
    const date = ticksToDate(value)
    const formatted = date.toLocaleString()
    return (
      <span
        style={{ opacity: 0.5, fontFamily: 'var(--mono)' }}
        title={`Raw: ${value}`}
      >
        {formatted}
      </span>
    )
  }
  return (
    <span style={{ opacity: 0.5, fontFamily: 'var(--mono)' }}>
      {String(value ?? '')}
    </span>
  )
}

export default function Settings() {
  const { activeServer } = useServer()

  const [vals, setVals] = useState<Record<string, SettingValue>>(defaultVals)
  const loadedVals = useRef<Record<string, SettingValue>>(defaultVals())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkSaveState, setBulkSaveState] = useState<BulkSaveState>('idle')
  const [activeTab, setActiveTab] = useState(0)

  const load = useCallback(() => {
    if (!activeServer?.serverName) return
    setLoading(true)
    setError(null)
    api
      .get<{ raw: string }>(`/servers/${activeServer.serverName}/settings`)
      .then(({ raw }) => {
        const parsed = tryParseSettings(raw)
        if (parsed) {
          const merged = { ...defaultVals(), ...(parsed as Record<string, SettingValue>) }
          loadedVals.current = merged
          setVals(merged)
        }
      })
      .catch((e) => setError((e as Error).message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [activeServer?.serverName])

  useEffect(() => {
    if (activeServer?.serverName && activeServer.running) load()
  }, [activeServer?.serverName, activeServer?.running, load])

  const set = (k: string, v: SettingValue) => {
    setVals((prev) => ({ ...prev, [k]: v }))
  }

  // Collect all keys that differ from what was loaded, restricted to available settings
  const dirtyKeys = Object.keys(vals).filter(
    (k) => AVAILABLE_SETTINGS.has(k) && vals[k] !== loadedVals.current[k]
  )
  const dirtyCount = dirtyKeys.length

  const saveAll = async () => {
    if (!activeServer?.serverName || dirtyCount === 0) return
    setBulkSaveState('saving')
    setError(null)
    const changes: Record<string, SettingValue> = {}
    for (const k of dirtyKeys) {
      changes[k] = vals[k] ?? ''
    }
    try {
      await api.put(`/servers/${activeServer.serverName}/settings`, { changes })
      // Commit the saved values so dirty tracking resets
      loadedVals.current = { ...loadedVals.current, ...changes }
      // Force a re-render so dirty indicators clear
      setVals((prev) => ({ ...prev }))
      setBulkSaveState('saved')
      setTimeout(() => setBulkSaveState('idle'), 1500)
    } catch (e) {
      setBulkSaveState('idle')
      setError((e as Error).message || 'Failed to save settings')
    }
  }

  const isOffline = !activeServer?.running
  const group = SERVER_SETTING_GROUPS[activeTab]

  return (
    <div className="main fadein">
      <PageHeader
        title="Server Settings"
        subtitle="getserversettings · setserversetting [key] [value]"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading || isOffline}>
            {loading ? 'Refreshing...' : 'Refresh'}
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

      {activeServer && !activeServer.running && (
        <div className="info-banner">
          Server is offline — settings are read-only. Start the server to make changes.
        </div>
      )}

      {loading && (
        <div
          style={{
            padding: '12px 0',
            color: 'var(--dim)',
            fontFamily: 'var(--mono)',
            fontSize: '11px',
          }}
        >
          Loading settings from server...
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Parameters</span>
          <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <button
              className={`btn btn-sm ${
                bulkSaveState === 'saved'
                  ? 'btn-green'
                  : dirtyCount > 0
                    ? 'btn-primary'
                    : 'btn-outline'
              }`}
              onClick={saveAll}
              disabled={dirtyCount === 0 || bulkSaveState === 'saving' || isOffline}
            >
              {bulkSaveState === 'saving'
                ? 'Saving...'
                : bulkSaveState === 'saved'
                  ? 'Saved!'
                  : dirtyCount > 0
                    ? `Save ${dirtyCount} Change${dirtyCount !== 1 ? 's' : ''}`
                    : 'No Changes'}
            </button>
            <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
              Changes apply immediately
            </span>
          </div>
        </div>
        <div className="card-body-0">
          <div className="settings-layout">
            {/* Sidebar */}
            <div className="settings-sidebar">
              <div className="settings-sidebar-label">Sections</div>
              {SERVER_SETTING_GROUPS.map((g, i) => (
                <div
                  key={g.label}
                  className={`settings-tab ${i === activeTab ? 'active' : ''}`}
                  onClick={() => setActiveTab(i)}
                  role="tab"
                  aria-selected={i === activeTab}
                >
                  <span className="settings-tab-abbr">{TAB_ABBRS[g.label] ?? g.label.slice(0, 3).toUpperCase()}</span>
                  <span className="settings-tab-full">{g.label}</span>
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="settings-content">
              <div className="settings-banner">
                <span className="settings-banner-icon">&#9888;</span>
                <div>
                  <div className="settings-banner-title">Most settings unavailable during playtest</div>
                  <div className="settings-banner-desc">
                    Only a subset of settings can be changed right now. The rest will be enabled in the full release.
                  </div>
                </div>
              </div>

              {group && (
                <>
                  <div className="settings-section-header">{group.desc}</div>
                  {group.settings.map((s) => {
                    const isReadonly = s.type === 'readonly'
                    const isAvailable = AVAILABLE_SETTINGS.has(s.key)
                    const isDisabled = isOffline || (!isReadonly && !isAvailable)
                    const isDirty = isAvailable && vals[s.key] !== loadedVals.current[s.key]
                    return (
                      <div
                        key={s.key}
                        className={`setting-row${isDisabled ? ' disabled' : ''}`}
                        style={isDirty ? { borderLeft: '2px solid var(--orange)' } : undefined}
                      >
                        <div className="setting-info">
                          <div className="setting-name">{s.name}</div>
                          <div className="setting-key">{s.key}</div>
                          <div className="setting-desc">{s.desc}</div>
                        </div>
                        <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                          <SettingInput
                            s={s}
                            value={vals[s.key] ?? s.value}
                            disabled={isDisabled}
                            onChange={(v) => set(s.key, v)}
                          />
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
