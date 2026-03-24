import { useState, useEffect, useRef, useCallback } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { useLiveLog } from '../hooks/useLiveLog.js'
import { api } from '../api/client.js'
import { GAME_COMMANDS } from '../lib/constants.js'

type ConsoleLine = { lineId: number; cls: string; text: string }

const LINE_CHUNK = 250

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
  const [cmdState, setCmdState] = useState<'idle' | 'sending' | 'sent'>('idle')

  // Smart scroll state
  const [displayLimit, setDisplayLimit] = useState(LINE_CHUNK)
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const lastLogRef = useRef<number>(0)

  // Track whether user is near the bottom of the scroll container
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 40
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold

    // Scroll-to-top: load more lines
    if (el.scrollTop === 0 && lines.length > displayLimit) {
      const prevHeight = el.scrollHeight
      setDisplayLimit((prev) => Math.min(prev + LINE_CHUNK, lines.length))
      // Preserve scroll position after adding lines at the top
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevHeight
      })
    }
  }, [lines.length, displayLimit])

  // Load historical log on mount / server change
  useEffect(() => {
    if (!activeServer?.serverName) return
    setLines([{ lineId: _consoleLineId++, cls: 'c-comment', text: '# Loading log history…' }])
    setDisplayLimit(LINE_CHUNK)
    isAtBottomRef.current = true
    api
      .get<{ lines: string[] }>(`/servers/${activeServer.serverName}/console/log?lines=1000`)
      .then((data) => {
        const initial = (data.lines ?? []).map((l) => ({
          lineId: _consoleLineId++,
          cls: 'c-log',
          text: l,
        }))
        setLines([...initial, { lineId: _consoleLineId++, cls: 'c-comment', text: '# Live stream active.' }])
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
    setLines((prev) => [
      ...prev,
      ...newLines.map((ll) => ({ lineId: ll.lineId, cls: 'c-log', text: ll.raw })),
    ])
  }, [liveLog])

  // Auto-scroll to bottom only when user is already at the bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines])

  const run = () => {
    if (!input.trim()) return
    const cmd = input.trim()
    setHist((h) => [cmd, ...h])
    setHi(-1)
    setInput('')
    if (activeServer?.serverName) {
      setCmdState('sending')
      api
        .post(`/servers/${activeServer.serverName}/console/command`, { command: cmd })
        .then(() => {
          setCmdState('sent')
          setTimeout(() => setCmdState('idle'), 1500)
        })
        .catch((e) => {
          setCmdState('idle')
          setError((e as Error).message || 'Command failed')
        })
    } else {
      setError('No active server selected.')
    }
  }

  const connected = activeServer?.running ?? false

  const wsStatusLabel =
    wsStatus === 'connected' ? 'Connected' :
    wsStatus === 'connecting' ? 'Connecting…' : 'Not Running'

  const wsStatusPill =
    wsStatus === 'connected' ? 'pill-green' :
    wsStatus === 'connecting' ? 'pill-orange' : 'pill-muted'

  // Only render the last displayLimit lines
  const visibleLines = lines.slice(-displayLimit)
  const hasMore = lines.length > displayLimit

  return (
    <div className="main fadein">
      <PageHeader
        title="Console"
        subtitle="Direct CLI access · Commands dispatched via server process stdin"
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setLines([{ lineId: _consoleLineId++, cls: 'c-comment', text: '# Console cleared.' }])
              setDisplayLimit(LINE_CHUNK)
            }}
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
              <div
                ref={scrollRef}
                className="console-out"
                aria-live="polite"
                aria-label="Console output"
                onScroll={handleScroll}
              >
                {hasMore && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '6px',
                      fontSize: '10px',
                      color: 'var(--dim)',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    Scroll up to load more ({lines.length - displayLimit} older lines)
                  </div>
                )}
                {visibleLines.map((l) => (
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
                <button
                  className={`btn btn-sm ${cmdState === 'sent' ? 'btn-green' : 'btn-primary'}`}
                  onClick={run}
                  disabled={cmdState === 'sending'}
                >
                  {cmdState === 'sending' ? 'Sending...' : cmdState === 'sent' ? 'Sent!' : 'Run'}
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