import { useState, useEffect } from 'react';
import PageHeader from '../components/ui/PageHeader.js';
import EmptyState from '../components/ui/EmptyState.js';
import { useServer } from '../hooks/useServer.js';
import { api } from '../api/client.js';

type ScheduledTask = {
  id: string;
  label: string;
  type: string;
  cronExpr: string;
  payload: string | null;
  enabled: boolean;
  nextRun: string | null;
  lastRun: string | null;
};

const typeColor: Record<string, string> = {
  WIPE:         'pill-orange',
  ANNOUNCEMENT: 'pill-blue',
  COMMAND:      'pill-green',
  RESTART:      'pill-muted',
};

export default function Schedules() {
  const { activeServer } = useServer();
  const [tasks,   setTasks]   = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [newLabel,   setNewLabel]   = useState('');
  const [newType,    setNewType]    = useState('COMMAND');
  const [newCron,    setNewCron]    = useState('0 0 * * 5');
  const [newPayload, setNewPayload] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);

  const load = () => {
    if (!activeServer?.id) return;
    setLoading(true);
    api.get<ScheduledTask[]>(`/servers/${activeServer.id}/schedules`)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeServer?.id]);

  const toggleEnabled = (task: ScheduledTask) => {
    if (!activeServer?.id) return;
    api.put(`/servers/${activeServer.id}/schedules/${task.id}`, { enabled: !task.enabled })
      .then(load)
      .catch(console.error);
  };

  const deleteTask = (taskId: string) => {
    if (!activeServer?.id) return;
    api.delete(`/servers/${activeServer.id}/schedules/${taskId}`)
      .then(load)
      .catch(console.error);
  };

  const runNow = (taskId: string) => {
    if (!activeServer?.id) return;
    api.post(`/servers/${activeServer.id}/schedules/${taskId}/run`)
      .then(() => alert('Task triggered manually.'))
      .catch(e => alert(`Failed: ${(e as Error).message}`));
  };

  const createTask = () => {
    if (!activeServer?.id || !newLabel.trim()) return;
    api.post(`/servers/${activeServer.id}/schedules`, {
      label:    newLabel,
      type:     newType,
      cronExpr: newCron,
      payload:  newPayload || null,
      enabled:  newEnabled,
    })
      .then(() => {
        setShowAdd(false);
        setNewLabel(''); setNewPayload('');
        load();
      })
      .catch(e => alert(`Failed: ${(e as Error).message}`));
  };

  const active = tasks.filter(s => s.enabled).length;
  const paused = tasks.filter(s => !s.enabled).length;

  return (
    <div className="main fadein">
      <PageHeader
        title="Schedules"
        subtitle="Cron-based tasks · wipe · command · announcement · restart"
        actions={<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Schedule</button>}
      />

      {/* ── Add Schedule Modal ────────────────────────────────── */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal fadein" onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <span className="card-title">New Scheduled Task</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Label</div></div>
                <input className="text-input" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Weekly Map Wipe" />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Type</div></div>
                <select className="sel-input" value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="COMMAND">Command</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="WIPE">Wipe</option>
                  <option value="RESTART">Restart</option>
                </select>
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Cron Expression</div>
                  <div className="setting-desc">e.g. 0 0 * * 5 = Every Friday midnight UTC</div>
                </div>
                <input className="text-input" value={newCron} onChange={e => setNewCron(e.target.value)} placeholder="0 0 * * 5" />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Payload</div>
                  <div className="setting-desc">Command text, announcement, or wipe type (MAP_ONLY / FULL / MAP_PLAYERS)</div>
                </div>
                <input className="text-input" value={newPayload} onChange={e => setNewPayload(e.target.value)} placeholder="e.g. MAP_ONLY or forcesave" />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Enable immediately</div></div>
                <div className={`toggle ${newEnabled ? 'on' : ''}`} onClick={() => setNewEnabled(p => !p)} />
              </div>
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createTask} disabled={!newLabel.trim()}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Scheduled Tasks</span>
          <span className="card-meta">{active} active · {paused} paused</span>
        </div>
        <div className="card-body-0">
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '11px' }}>Loading…</div>
          ) : tasks.length === 0 ? (
            <EmptyState icon="◷" title="No scheduled tasks" desc="Add a scheduled wipe, announcement, command, or restart." />
          ) : (
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tasks.map(s => (
                <div key={s.id} className={`task-card${!s.enabled ? ' disabled' : ''}`}>
                  <div className="row">
                    <span style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '13px' }}>{s.label}</span>
                    <span className={`pill ${s.enabled ? 'pill-green' : 'pill-muted'}`} style={{ fontSize: '10px' }}>
                      {s.enabled ? 'Enabled' : 'Paused'}
                    </span>
                    <span className={`pill ${typeColor[s.type] ?? 'pill-muted'}`} style={{ fontSize: '10px' }}>{s.type}</span>
                    <div className="spacer" />
                    <button className="btn btn-ghost btn-xs"  onClick={() => runNow(s.id)}>Run Now</button>
                    <button className="btn btn-ghost btn-xs"  onClick={() => toggleEnabled(s)}>
                      {s.enabled ? 'Pause' : 'Enable'}
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => deleteTask(s.id)}>Delete</button>
                  </div>
                  <div className="task-meta">
                    {([
                      ['Cron',     s.cronExpr],
                      ['Payload',  s.payload ?? '—'],
                      ['Next Run', s.nextRun  ?? '—'],
                      ['Last Run', s.lastRun  ?? '—'],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="task-meta-item">
                        <div className="task-meta-label">{k}</div>
                        <div className="task-meta-value">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: '11px', padding: '8px', fontFamily: 'var(--mono)' }}>
                Pre-wipe announcements are sent automatically at T-60min and T-5min.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
