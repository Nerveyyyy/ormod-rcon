import { useState, useEffect, useRef } from 'react';
import PageHeader from '../components/ui/PageHeader.js';
import { useServer } from '../hooks/useServer.js';
import { useLiveLog } from '../hooks/useLiveLog.js';
import { api } from '../api/client.js';
import { quickCmds } from '../mockData.js';

type ConsoleLine = { cls: string; text: string };

export default function Console() {
  const { activeServer } = useServer();
  const liveLog = useLiveLog(activeServer?.id ?? null);
  const [lines, setLines] = useState<ConsoleLine[]>([{ cls: 'c-comment', text: '# Console ready.' }]);
  const [input, setInput] = useState('');
  const [hist,  setHist]  = useState<string[]>([]);
  const [hi,    setHi]    = useState(-1);
  const endRef       = useRef<HTMLDivElement>(null);
  const lastLogRef   = useRef<number>(0);

  // Load historical log on mount / server change
  useEffect(() => {
    if (!activeServer?.id) return;
    setLines([{ cls: 'c-comment', text: '# Loading log history…' }]);
    api.get<{ lines: string[] }>(`/servers/${activeServer.id}/console/log?lines=100`)
      .then(data => {
        const initial = (data.lines ?? []).map(l => ({ cls: 'c-log', text: l }));
        setLines([...initial, { cls: 'c-comment', text: '# Live stream active.' }]);
      })
      .catch(() => setLines([{ cls: 'c-comment', text: '# Log unavailable — server may not be running.' }]));
    lastLogRef.current = 0;
  }, [activeServer?.id]);

  // Append new live log lines (deduplicated by index)
  useEffect(() => {
    if (liveLog.length === 0) return;
    const newLines = liveLog.slice(lastLogRef.current);
    if (newLines.length === 0) return;
    lastLogRef.current = liveLog.length;
    setLines(l => [...l, ...newLines.map(ll => ({ cls: 'c-log', text: ll.raw }))]);
  }, [liveLog]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  const run = () => {
    if (!input.trim()) return;
    const cmd = input.trim();
    setLines(l => [...l, { cls: 'c-input', text: `  ${cmd}` }]);
    setHist(h => [cmd, ...h]);
    setHi(-1);
    setInput('');
    if (activeServer?.id) {
      api.post(`/servers/${activeServer.id}/console/command`, { command: cmd })
        .then(() => setLines(l => [...l, { cls: 'c-ok', text: '  [OK] Command dispatched.' }]))
        .catch(() => setLines(l => [...l, { cls: 'c-err', text: '  [ERR] Command failed — server not running?' }]));
    } else {
      setLines(l => [...l, { cls: 'c-err', text: '  [ERR] No active server selected.' }]);
    }
  };

  const connected = activeServer?.running ?? false;

  return (
    <div className="main fadein">
      <PageHeader
        title="Console"
        subtitle="Direct CLI access · Commands dispatched via server process stdin"
        actions={
          <button className="btn btn-ghost btn-sm"
            onClick={() => setLines([{ cls: 'c-comment', text: '# Console cleared.' }])}>
            Clear
          </button>
        }
      />

      <div className="grid-3">
        <div className="col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Terminal</span>
              <span className={`pill ${connected ? 'pill-green' : 'pill-muted'}`}>
                {connected && <span className="dot dot-green pulse" />}
                {connected ? 'Connected' : 'Not Running'}
              </span>
            </div>
            <div className="card-body">
              <div className="console-out">
                {lines.map((l, i) => (
                  <div key={i} className={`c-line ${l.cls}`}>{l.text || '\u00A0'}</div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="console-input-row">
                <span className="c-prompt">$</span>
                <input
                  className="c-field"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') run();
                    if (e.key === 'ArrowUp') {
                      const n = Math.min(hi + 1, hist.length - 1);
                      setHi(n); setInput(hist[n] ?? '');
                    }
                    if (e.key === 'ArrowDown') {
                      const n = Math.max(hi - 1, -1);
                      setHi(n); setInput(n < 0 ? '' : hist[n]);
                    }
                  }}
                  placeholder="type a command..."
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={run}>Run</button>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-header"><span className="card-title">Quick Commands</span></div>
          <div className="card-body-0" style={{ maxHeight: '460px', overflowY: 'auto' }}>
            {quickCmds.map((q, i) => (
              <div key={i} className="quick-cmd" onClick={() => setInput(q.cmd + ' ')}>
                <span className={`perm perm-${q.perm}`} style={{ flexShrink: 0 }}>[{q.perm}]</span>
                <span className="qc-cmd">{q.cmd}</span>
                <span className="qc-desc">{q.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
