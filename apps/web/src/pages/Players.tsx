import { Fragment, useState, useEffect, type ReactNode } from 'react';
import PageHeader from '../components/ui/PageHeader.js';
import { useServer } from '../hooks/useServer.js';
import { api } from '../api/client.js';

type Player = {
  steamId: string;
  permission: string | null;
  online: boolean;
  data: Record<string, unknown>;
};

export default function Players() {
  const { activeServer } = useServer();
  const [players, setPlayers] = useState<Player[]>([]);
  const [active,  setActive]  = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!activeServer?.id) return;
    setLoading(true);
    api.get<Player[]>(`/servers/${activeServer.id}/players`)
      .then(setPlayers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeServer?.id]);

  const dispatch = (cmd: string) => {
    if (!activeServer?.id) return;
    api.post(`/servers/${activeServer.id}/console/command`, { command: cmd }).catch(console.error);
  };

  const online  = players.filter(p => p.online).length;
  const offline = players.filter(p => !p.online).length;

  return (
    <div className="main fadein">
      <PageHeader
        title="Player Management"
        subtitle="adminlist.txt · setpermissions · kick · ban · whitelist"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={load}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => dispatch('say ')}>Broadcast</button>
          </>
        }
      />

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Players</span>
          <span className="card-meta">{online} online · {offline} offline</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Steam ID</th><th>Permission</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
                    {loading ? 'Loading…' : 'No players found. Click Refresh to load.'}
                  </td>
                </tr>
              )}
              {players.map(p => (
                <Fragment key={p.steamId}>
                  <tr onClick={() => setActive(active === p.steamId ? null : p.steamId)} style={{ cursor: 'pointer' }}>
                    <td className="mono bright">{p.steamId}</td>
                    <td><span className={`perm perm-${p.permission ?? 'client'}`}>[{p.permission ?? 'client'}]</span></td>
                    <td>
                      {p.online
                        ? <span className="pill pill-green"><span className="dot dot-green pulse" />Online</span>
                        : <span className="pill pill-muted">Offline</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="btn-group">
                        <button className="btn btn-ghost btn-xs"  onClick={() => dispatch(`teleport ${p.steamId}`)}>Teleport</button>
                        <button className="btn btn-ghost btn-xs"  onClick={() => dispatch(`heal ${p.steamId}`)}>Heal</button>
                        <button className="btn btn-danger btn-xs" onClick={() => dispatch(`kick ${p.steamId}`)}>Kick</button>
                        <button className="btn btn-danger btn-xs" onClick={() => dispatch(`ban ${p.steamId}`)}>Ban</button>
                      </div>
                    </td>
                  </tr>
                  {active === p.steamId && (
                    <tr key={`detail-${p.steamId}`}>
                      <td colSpan={4} style={{ padding: 0, background: 'var(--bg2)' }}>
                        <div style={{ padding: '16px 20px' }}>
                          <div className="row" style={{ marginBottom: '12px' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{p.steamId}</span>
                          </div>
                          <div className="row" style={{ gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                            {([
                              ['Permission', <span className={`perm perm-${p.permission ?? 'client'}`}>[{p.permission ?? 'client'}]</span>],
                              ['Status',     p.online ? 'Online' : 'Offline'],
                            ] as [string, ReactNode][]).map(([label, val]) => (
                              <div key={label as string} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '2px', padding: '10px 16px', minWidth: '130px' }}>
                                <div className="stat-label">{label}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '2px' }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          <div className="btn-group">
                            <button className="btn btn-ghost btn-sm"   onClick={() => dispatch(`setpermissions ${p.steamId} admin`)}>Set Admin</button>
                            <button className="btn btn-ghost btn-sm"   onClick={() => dispatch(`teleport ${p.steamId}`)}>Teleport To</button>
                            <button className="btn btn-ghost btn-sm"   onClick={() => dispatch(`heal ${p.steamId}`)}>Heal</button>
                            <button className="btn btn-primary btn-sm" onClick={() => dispatch(`whitelist add ${p.steamId}`)}>Whitelist</button>
                            <button className="btn btn-danger btn-sm"  onClick={() => dispatch(`kick ${p.steamId}`)}>Kick</button>
                            <button className="btn btn-danger btn-sm"  onClick={() => dispatch(`ban ${p.steamId}`)}>Ban</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
