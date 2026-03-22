import { useState, useEffect, useRef } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { useLiveLog } from '../hooks/useLiveLog.js'
import { api } from '../api/client.js'
import { GAME_COMMANDS } from '../lib/constants.js'

type ConsoleLine = { lineId: number; cls: string; text: string }

let _consoleLineId = 0

export default function Console() {
  const { activeServer } = useServer()
  const { lines: liveLog, status: wsStatus } = useLiveLog(activeServer?.serverName ?? null)
  const [lines, setLines] = useState<ConsoleLine[]>([
    { lineId: _consoleLineId++, cls: 'c-comment', text: '# Console ready.' },
  ])
  const [input, setInput] = useState('')
  const [hist, setHist] = useState<string[]>([])
  const [hi, setHi] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const lastLogRef = useRef<number>(0)

  const appendLine = (cls: string, text: string) => {
    setLines((prev) => [...prev.slice(-999), { lineId: _consoleLineId++, cls, text }])
  }

  // Load historical log on mount / server change
  useEffect(() => {
    if (!activeServer?.serverName) return
    setLines([{ lineId: _consoleLineId++, cls: 'c-comment', text: '# Loading log history…' }])
    api
      .get<{ lines: string[] }>(`/servers/${activeServer.serverName}/console/log?lines=1000`)
      .then((data) => {
        const initial = (data.lines ?? []).map((l) => ({
          lineId: _consoleLineId++,
          cls: 'c-log',
          text: l,
        }))
        setLines([...initial.slice(-999), { lineId: _consoleLineId++, cls: 'c-comment', text: '# Live stream active.' }])
      })
      .catch((e) => {
        setLines([{ lineId: _consoleLineId++, cls: 'c-comment', text: '# Log unavailable — server may not be running.' }])
        setError((e as Error).message || 'Failed to load log history')
      })
    lastLogRef.current = 0
  }, [activeServer?.serverName])

  // Append new live log lines (deduplicated by index)
  useEffect(() => {
    if (liveLog.length === 0) return
    const newLines = liveLog.slice(lastLogRef.current)
    if (newLines.length === 0) return
    lastLogRef.current = liveLog.length
    setLines((prev) => {
      const appended = [
        ...prev,
        ...newLines.map((ll) => ({ lineId: ll.lineId, cls: 'c-log', text: ll.raw })),
      ]
      return appended.slice(-1000)
    })
  }, [liveLog])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const run = () => {
    if (!input.trim()) return
    const cmd = input.trim()
    setHist((h) => [cmd, ...h])
    setHi(-1)
    setInput('')
    if (activeServer?.serverName) {
      api
        .post(`/servers/${activeServer.serverName}/console/command`, { command: cmd })
        .then(() => appendLine('c-ok', '  [OK] Command dispatched.'))
        .catch((e) => {
          appendLine('c-err', '  [ERR] Command failed — server not running?')
          setError((e as Error).message || 'Command failed')
        })
    } else {
      appendLine('c-err', '  [ERR] No active server selected.')
    }
  }

  const connected = activeServer?.running ?? false

  const wsStatusLabel =
    wsStatus === 'connected' ? 'Connected' :
    wsStatus === 'connecting' ? 'Connecting…' : 'Not Running'

  const wsStatusPill =
    wsStatus === 'connected' ? 'pill-green' :
    wsStatus === 'connecting' ? 'pill-orange' : 'pill-muted'

  return (
    <div className="main fadein">
      <PageHeader
        title="Console"
        subtitle="Direct CLI access · Commands dispatched via server process stdin"
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setLines([{ lineId: _consoleLineId++, cls: 'c-comment', text: '# Console cleared.' }])}
          >
            Clear
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

      <div className="grid-3">
        <div className="col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Terminal</span>
              <span className={`pill ${wsStatusPill}`}>
                {connected && wsStatus === 'connected' && (
                  <span className="dot dot-green pulse" />
                )}
                {wsStatusLabel}
              </span>
            </div>
            <div className="card-body">
              <div className="console-out" aria-live="polite" aria-label="Console output">
                {lines.map((l) => (
                  <div key={l.lineId} className={`c-line ${l.cls}`}>
                    {l.text || '\u00A0'}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="console-input-row">
                <span className="c-prompt">$</span>
                <input
                  className="c-field"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') run()
                    if (e.key === 'ArrowUp') {
                      const n = Math.min(hi + 1, hist.length - 1)
                      setHi(n)
                      setInput(hist[n] ?? '')
                    }
                    if (e.key === 'ArrowDown') {
                      const n = Math.max(hi - 1, -1)
                      setHi(n)
                      setInput(n < 0 ? '' : (hist[n] ?? ''))
                    }
                  }}
                  placeholder="type a command..."
                  autoFocus
                  aria-label="Console command input"
                />
                <button className="btn btn-primary btn-sm" onClick={run}>
                  Run
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-header">
            <span className="card-title">Quick Commands</span>
          </div>
          <div className="card-body-0" style={{ maxHeight: '460px', overflowY: 'auto' }}>
            {GAME_COMMANDS.map((q) => (
              <div
                key={q.cmd}
                className="quick-cmd"
                role="button"
                tabIndex={0}
                onClick={() => setInput(q.cmd + ' ')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setInput(q.cmd + ' ')
                  }
                }}
              >
                <span className={`perm perm-${q.perm}`} style={{ flexShrink: 0 }}>
                  [{q.perm}]
                </span>
                <span className="qc-cmd">{q.cmd}</span>
                <span className="qc-desc">{q.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
