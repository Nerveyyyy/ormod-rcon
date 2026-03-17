import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { SERVER_SETTING_GROUPS } from '../lib/constants.js'
import { api } from '../api/client.js'

type SettingValue = string | number | boolean
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

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
    // Coerce to bool/number where possible
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

export default function Settings() {
  const { activeServer } = useServer()

  const [vals, setVals] = useState<Record<string, SettingValue>>(defaultVals)
  const [rawOutput, setRawOutput] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})

  const load = useCallback(() => {
    if (!activeServer?.id) return
    setLoading(true)
    setError(null)
    api
      .get<{ raw: string }>(`/servers/${activeServer.id}/settings`)
      .then(({ raw }) => {
        setRawOutput(raw)
        const parsed = tryParseSettings(raw)
        if (parsed) {
          setVals((prev) => ({ ...prev, ...(parsed as Record<string, SettingValue>) }))
        }
      })
      .catch((e) => setError((e as Error).message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [activeServer?.id])

  useEffect(() => {
    if (activeServer?.id) load()
  }, [activeServer?.id, load])

  const set = (k: string, v: SettingValue) => {
    setVals((prev) => ({ ...prev, [k]: v }))
  }

  const applyKey = async (key: string, value: SettingValue) => {
    if (!activeServer?.id) return
    setSaveStates((prev) => ({ ...prev, [key]: 'saving' }))
    try {
      await api.put(`/servers/${activeServer.id}/settings/${key}`, { value })
      setSaveStates((prev) => ({ ...prev, [key]: 'saved' }))
      setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [key]: 'idle' }))
      }, 1500)
    } catch (e) {
      setSaveStates((prev) => ({ ...prev, [key]: 'error' }))
      setError((e as Error).message || `Failed to apply ${key}`)
    }
  }

  return (
    <div className="main fadein">
      <PageHeader
        title="Server Settings"
        subtitle="getserversettings · setserversetting [key] [value]"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
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

      {loading && !rawOutput && (
        <div
          style={{
            padding: '12px 0',
            color: 'var(--dim)',
            fontFamily: 'var(--mono)',
            fontSize: '11px',
          }}
        >
          Loading settings from server…
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Parameters</span>
          <span className="pill pill-green">
            <span className="dot dot-green pulse" />
            Live Reload Active
          </span>
        </div>
        <div className="card-body-0">
          {SERVER_SETTING_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="setting-group-label">{g.label}</div>
              {g.settings.map((s) => {
                const state = saveStates[s.key] ?? 'idle'
                const isReadonly = s.type === 'readonly'
                return (
                  <div key={s.key} className="setting-row">
                    <div className="setting-info">
                      <div className="setting-name">{s.name}</div>
                      <div className="setting-key">{s.key}</div>
                      <div className="setting-desc">{s.desc}</div>
                    </div>
                    <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                      {s.type === 'bool' && (
                        <div className="toggle-wrap">
                          <span
                            className="toggle-val"
                            style={{ color: vals[s.key] ? 'var(--green)' : 'var(--dim)' }}
                          >
                            {vals[s.key] ? 'true' : 'false'}
                          </span>
                          <button
                            className={`toggle ${vals[s.key] ? 'on' : ''}`}
                            role="switch"
                            aria-checked={vals[s.key] as boolean}
                            aria-label={s.name}
                            onClick={() => set(s.key, !vals[s.key])}
                          />
                        </div>
                      )}
                      {s.type === 'number' && (
                        <input
                          className="num-input"
                          type="number"
                          value={vals[s.key] as number}
                          onChange={(e) => set(s.key, parseFloat(e.target.value))}
                          aria-label={s.name}
                        />
                      )}
                      {s.type === 'select' && (
                        <select
                          className="sel-input"
                          value={vals[s.key] as string}
                          onChange={(e) => set(s.key, e.target.value)}
                          aria-label={s.name}
                        >
                          {(s as { options?: string[] }).options?.map((o: string) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      )}
                      {s.type === 'text' && (
                        <input
                          className="text-input"
                          type="text"
                          value={vals[s.key] as string}
                          onChange={(e) => set(s.key, e.target.value)}
                          aria-label={s.name}
                        />
                      )}
                      {s.type === 'readonly' && (
                        <span style={{ opacity: 0.5, fontFamily: 'var(--mono)' }}>
                          {String(vals[s.key] ?? '')}
                        </span>
                      )}
                      {!isReadonly && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => applyKey(s.key, vals[s.key] ?? s.value)}
                          disabled={state === 'saving'}
                          aria-label={`Apply ${s.name}`}
                        >
                          {state === 'saving' ? 'Applying…' : state === 'saved' ? '✓' : 'Apply'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">
          <span className="card-title">Raw Response</span>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
          >
            {showRaw ? 'Hide' : 'Show'}
          </button>
        </div>
        {showRaw && (
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
                maxHeight: '320px',
                overflowY: 'auto',
              }}
            >
              {rawOutput ?? '— no data yet —'}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
