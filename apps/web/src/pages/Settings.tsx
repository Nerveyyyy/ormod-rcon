import { useState, useEffect, useCallback, useRef } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { SERVER_SETTING_GROUPS } from '../lib/constants.js'
import type { Setting } from '../lib/constants.js'
import { api } from '../api/client.js'

type SettingValue = string | number | boolean
type BulkSaveState = 'idle' | 'saving' | 'saved' | 'partial'

/**
 * Settings available via setserversetting during playtest.
 * Only these keys can actually be changed in-game right now.
 */
const AVAILABLE_SETTINGS = new Set([
  'IsOnline',
  'FriendsOnly',
  'MaxPlayers',
  'Description',
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

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m ago`
}

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

type SettingsResponse = {
  settings: Record<string, string | number | boolean>
  fetchedAt?: number
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

const CACHE_KEY = 'ormod-settings-cache'

function getCachedSettings(serverName: string): Record<string, SettingValue> | null {
  try {
    const cached = sessionStorage.getItem(`${CACHE_KEY}:${serverName}`)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

function setCachedSettings(serverName: string, vals: Record<string, SettingValue>) {
  try {
    sessionStorage.setItem(`${CACHE_KEY}:${serverName}`, JSON.stringify(vals))
  } catch { /* quota exceeded — ignore */ }
}

export default function Settings() {
  const { activeServer } = useServer()

  const [vals, setVals] = useState<Record<string, SettingValue>>(defaultVals)
  const loadedVals = useRef<Record<string, SettingValue>>(defaultVals())
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkSaveState, setBulkSaveState] = useState<BulkSaveState>('idle')
  const [failedKeys, setFailedKeys] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState(0)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const load = useCallback((forceRefresh = false) => {
    if (!activeServer?.serverName) return
    setLoading(true)
    setError(null)
    const qs = forceRefresh ? '?refresh=true' : ''
    api
      .get<SettingsResponse>(`/servers/${activeServer.serverName}/settings${qs}`)
      .then(({ settings, fetchedAt: ts }) => {
        if (settings && Object.keys(settings).length > 0) {
          const merged = { ...defaultVals(), ...settings }
          loadedVals.current = merged
          setVals(merged)
          setCachedSettings(activeServer.serverName, merged)
        }
        if (ts) setFetchedAt(ts)
        setLoaded(true)
      })
      .catch((e) => {
        setError((e as Error).message || 'Failed to load settings')
        setLoaded(true)
      })
      .finally(() => setLoading(false))
  }, [activeServer?.serverName])

  // Restore cached settings on server switch, then fetch fresh
  useEffect(() => {
    if (!activeServer?.serverName) return
    setLoaded(false)
    const cached = getCachedSettings(activeServer.serverName)
    if (cached) {
      loadedVals.current = cached
      setVals(cached)
      setLoaded(true)
    }
    if (activeServer.running) load()
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
    setFailedKeys({})
    const changes: Record<string, SettingValue> = {}
    for (const k of dirtyKeys) {
      changes[k] = vals[k] ?? ''
    }
    try {
      const res = await api.put<{ results: { key: string; ok: boolean; value: SettingValue; error?: string }[] }>(
        `/servers/${activeServer.serverName}/settings`,
        { changes }
      )
      const succeeded = res.results.filter((r) => r.ok)
      const failed = res.results.filter((r) => !r.ok)

      // Commit only the values that actually saved
      if (succeeded.length > 0) {
        const successMap = Object.fromEntries(succeeded.map((r) => [r.key, r.value]))
        loadedVals.current = { ...loadedVals.current, ...successMap }
        setCachedSettings(activeServer.serverName, loadedVals.current)
      }

      if (failed.length > 0) {
        // Revert failed keys to their loaded values
        setVals((prev) => {
          const reverted = { ...prev }
          for (const f of failed) reverted[f.key] = loadedVals.current[f.key] ?? ''
          return reverted
        })
        setFailedKeys(Object.fromEntries(failed.map((f) => [f.key, f.error ?? 'Failed'])))
        const names = failed.map((f) => f.key).join(', ')
        setError(`Some settings could not be changed: ${names}`)
        setBulkSaveState('partial')
        setTimeout(() => { setBulkSaveState('idle'); setFailedKeys({}) }, 4000)
      } else {
        setVals((prev) => ({ ...prev }))
        setBulkSaveState('saved')
        setTimeout(() => setBulkSaveState('idle'), 1500)
        // Re-fetch from game server to confirm saved values
        load(true)
      }
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {fetchedAt && !loading && (
              <span style={{ fontSize: '0.75rem', color: 'var(--dim)' }}>
                {formatTimeAgo(fetchedAt)}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={loading || isOffline}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </span>
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

      {!loaded && loading && (
        <div
          style={{
            padding: '48px 0',
            textAlign: 'center',
            color: 'var(--dim)',
            fontFamily: 'var(--mono)',
            fontSize: '11px',
          }}
        >
          Loading settings from server...
        </div>
      )}

      {loaded && <div className="card">
        <div className="card-header">
          <span className="card-title">Parameters</span>
          <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <button
              className={`btn btn-sm ${
                bulkSaveState === 'saved'
                  ? 'btn-green'
                  : bulkSaveState === 'partial'
                    ? 'btn-orange'
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
                  : bulkSaveState === 'partial'
                    ? 'Partially Saved'
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
                    const failError = failedKeys[s.key]
                    return (
                      <div
                        key={s.key}
                        className={`setting-row${isDisabled ? ' disabled' : ''}`}
                        style={failError ? { borderLeft: '2px solid var(--red)' } : isDirty ? { borderLeft: '2px solid var(--orange)' } : undefined}
                      >
                        <div className="setting-info">
                          <div className="setting-name">{s.name}</div>
                          <div className="setting-key">{s.key}</div>
                          <div className="setting-desc">{s.desc}</div>
                          {failError && (
                            <div style={{ fontSize: '10px', color: 'var(--red)', marginTop: '2px' }}>
                              {failError}
                            </div>
                          )}
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
      </div>}
    </div>
  )
}
