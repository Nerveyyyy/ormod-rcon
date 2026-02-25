import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useServer } from '../hooks/useServer.js';
import { useLiveLog } from '../hooks/useLiveLog.js';
import { api } from '../api/client.js';

type Schedule = {
  id: string;
  label: string;
  cronExpr: string;
  type: string;
  enabled: boolean;
  nextRun: string | null;
};

export default function Dashboard() {
  const { activeServer } = useServer();
  const liveLog = useLiveLog(activeServer?.id ?? null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeServer?.id) return;
    api.get<Schedule[]>(`/servers/${activeServer.id}/schedules`)
      .then(setSchedules)
      .catch(console.error);
    api.get<Record<string, unknown>>(`/servers/${activeServer.id}/settings`)
      .then(setSettings)
      .catch(console.error);
  }, [activeServer?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveLog]);

  const dispatch = (command: string) => {
    if (!activeServer?.id) return;
    api.post(`/servers/${activeServer.id}/console/command`, { command }).catch(console.error);
  };

  const maxPlayers       = settings?.MaxPlayers ?? '—';
  // WorldName comes directly from serversettings.json — shows as soon as the
  // game creates the file and is selected in the switcher.
  const worldName        = settings?.WorldName  ?? '—';
  const enabledSchedules = schedules.filter(s => s.enabled);

  return (
    <div className="main fadein">

      {/* ── Stat strip ─────────────────────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-item">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: '16px', paddingTop: '6px' }}>
            {activeServer?.running
              ? <span style={{ color: 'var(--green)' }}>Running</span>
              : <span style={{ color: 'var(--dim)' }}>Stopped</span>}
          </div>
          <div className="stat-sub">{activeServer?.name ?? 'No server selected'}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">World</div>
          <div className="stat-value" style={{ fontSize: '16px', paddingTop: '6px', color: 'var(--orange)' }}>
            {String(worldName)}
          </div>
          <div className="stat-sub">WorldName</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Max Players</div>
          <div className="stat-value">{String(maxPlayers)}</div>
          <div className="stat-sub">Configured slots</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Schedules</div>
          <div className="stat-value">{enabledSchedules.length}</div>
          <div className="stat-sub">Active tasks</div>
        </div>
      </div>

      {/* ── Activity log + Quick actions ─────────────────────────── */}
      <div className="grid-3">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Activity Log</span>
            <span className="pill pill-green">
              <span className="dot dot-green pulse" />
              Live
            </span>
          </div>
          <div style={{ background: 'var(--bg0)', overflowY: 'auto', maxHeight: '320px' }}>
            {liveLog.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                {activeServer?.running ? 'Waiting for log lines…' : 'Server is not running.'}
              </div>
            )}
            {liveLog.map((l, i) => (
              <div key={i} className="log-entry log-info">
                <span className="log-time">{new Date(l.ts).toLocaleTimeString()}</span>
                <span className="log-msg">{l.raw}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Actions</span>
            </div>
            <div className="card-body">
              <div className="btn-group">
                <button className="btn btn-primary btn-sm" onClick={() => dispatch('forcesave')}>Force Save</button>
                <button className="btn btn-ghost btn-sm"   onClick={() => dispatch('say Attention: Server maintenance in 5 minutes.')}>Announcement</button>
                <button className="btn btn-ghost btn-sm"   onClick={() => dispatch('setweather clear')}>Set Weather</button>
                <button className="btn btn-danger btn-sm"  onClick={() => dispatch('kickall')}>Kick All</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Server info + Upcoming schedules ─────────────────────── */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Server Info</span>
            <span className={`pill ${activeServer?.running ? 'pill-green' : 'pill-muted'}`}>
              {activeServer?.running && <span className="dot dot-green pulse" />}
              {activeServer?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="card-body-0">
            {([
              ['Display Name', activeServer?.name                              ?? '—'],
              ['Server Name',  activeServer?.serverName                        ?? '—'],
              ['World Name',   String(settings?.WorldName ?? '—')              ],
              ['Game Port',    activeServer ? `${activeServer.gamePort} (UDP)` : '—'],
              ['Query Port',   activeServer ? `${activeServer.queryPort} (UDP)`: '—'],
              ['Save Path',    activeServer?.savePath                          ?? '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="setting-row">
                <span className="setting-key" style={{ minWidth: '110px' }}>{k}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text)', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Upcoming Schedules</span>
            <Link to="/schedules" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          <div className="card-body-0">
            {enabledSchedules.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                No active schedules.
              </div>
            )}
            {enabledSchedules.slice(0, 5).map(s => (
              <div key={s.id} className="setting-row">
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--dim)', marginTop: '2px' }}>
                    {s.cronExpr}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text)' }}>{s.nextRun ?? '—'}</div>
                  <span
                    className={`pill ${s.type === 'WIPE' ? 'pill-orange' : s.type === 'ANNOUNCEMENT' ? 'pill-blue' : 'pill-muted'}`}
                    style={{ fontSize: '9px', marginTop: '4px' }}
                  >
                    {s.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
