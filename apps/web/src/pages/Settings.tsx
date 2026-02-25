import { useState, useEffect } from 'react';
import PageHeader from '../components/ui/PageHeader.js';
import { useServer } from '../hooks/useServer.js';
import { useSettings } from '../hooks/useSettings.js';
import { settingGroups } from '../mockData.js';
import { api } from '../api/client.js';

type SettingValue = string | number | boolean;

export default function Settings() {
  const { activeServer } = useServer();
  const { settings: apiSettings, loading } = useSettings(activeServer?.id ?? null);

  const [vals, setVals] = useState<Record<string, SettingValue>>(
    settingGroups.flatMap(g => g.settings).reduce((a, s) => ({ ...a, [s.key]: s.value }), {})
  );
  const [saved,  setSaved]  = useState(false);
  const [saving, setSaving] = useState(false);

  // Merge API values over defaults once loaded
  useEffect(() => {
    if (!apiSettings) return;
    setVals(prev => ({ ...prev, ...(apiSettings as Record<string, SettingValue>) }));
  }, [apiSettings]);

  const set = (k: string, v: SettingValue) => { setVals(p => ({ ...p, [k]: v })); setSaved(false); };

  const saveSettings = async () => {
    if (!activeServer?.id) return;
    setSaving(true);
    try {
      await api.put(`/servers/${activeServer.id}/settings`, vals);
      setSaved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const reloadFromFile = () => {
    if (!activeServer?.id) return;
    api.get<Record<string, unknown>>(`/servers/${activeServer.id}/settings`)
      .then(data => setVals(prev => ({ ...prev, ...(data as Record<string, SettingValue>) })))
      .catch(console.error);
  };

  return (
    <div className="main fadein">
      <PageHeader
        title="Server Settings"
        subtitle="serversettings.json · setserversetting [key] [value] · live reload"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={reloadFromFile}>Reload from File</button>
            <button className="btn btn-primary btn-sm" onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save to JSON'}
            </button>
          </>
        }
      />

      {loading && (
        <div style={{ padding: '12px 0', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
          Loading settings from server…
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Parameters</span>
            <span className="pill pill-green"><span className="dot dot-green pulse" />Live Reload Active</span>
          </div>
          <div className="card-body-0">
            {settingGroups.map(g => (
              <div key={g.label}>
                <div className="setting-group-label">{g.label}</div>
                {g.settings.map(s => (
                  <div key={s.key} className="setting-row">
                    <div className="setting-info">
                      <div className="setting-name">{s.name}</div>
                      <div className="setting-key">{s.key}</div>
                      <div className="setting-desc">{s.desc}</div>
                    </div>
                    <div>
                      {s.type === 'bool' && (
                        <div className="toggle-wrap">
                          <span className="toggle-val" style={{ color: vals[s.key] ? 'var(--green)' : 'var(--dim)' }}>
                            {vals[s.key] ? 'true' : 'false'}
                          </span>
                          <div className={`toggle ${vals[s.key] ? 'on' : ''}`} onClick={() => set(s.key, !vals[s.key])} />
                        </div>
                      )}
                      {s.type === 'number' && (
                        <input className="num-input" type="number" value={vals[s.key] as number}
                          onChange={e => set(s.key, parseFloat(e.target.value))} />
                      )}
                      {s.type === 'select' && (
                        <select className="sel-input" value={vals[s.key] as string}
                          onChange={e => set(s.key, e.target.value)}>
                          {(s as { options?: string[] }).options?.map((o: string) => <option key={o}>{o}</option>)}
                        </select>
                      )}
                      {s.type === 'text' && (
                        <input className="text-input" type="text" value={vals[s.key] as string}
                          onChange={e => set(s.key, e.target.value)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: '16px' }}>
          <div className="card-header">
            <span className="card-title">serversettings.json</span>
            <span className="card-meta">Live Preview</span>
          </div>
          <div className="card-body-0">
            <div className="json-pane">
              <span className="jd">{'{'}</span><br />
              {settingGroups.flatMap(g => g.settings).map(s => (
                <div key={s.key} style={{ paddingLeft: '16px' }}>
                  <span className="jk">"{s.key}"</span>
                  <span className="jd">: </span>
                  {s.type === 'bool'
                    ? <span className="jb">{String(vals[s.key])}</span>
                    : s.type === 'number'
                    ? <span className="jn">{vals[s.key] as number}</span>
                    : <span className="js">"{vals[s.key]}"</span>}
                  <span className="jd">,</span>
                </div>
              ))}
              <span className="jd">{'}'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
