import { useState, useEffect } from 'react';
import PageHeader from '../components/ui/PageHeader.js';
import EmptyState from '../components/ui/EmptyState.js';
import { useServer } from '../hooks/useServer.js';
import { api } from '../api/client.js';

type AccessList = {
  id: string;
  name: string;
  type: string;
  scope: string;
  readonly: boolean;
  syncedAt: string | null;
  externalUrl: string | null;
  entryCount: number;
};

type ListEntry = {
  steamId: string;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
  permissionLevel: string | null;
};

function ScopeBadge({ scope }: { scope: string }) {
  return <span className={`scope scope-${scope.toLowerCase()}`}>{scope.toLowerCase()}</span>;
}

const groups = [
  { label: 'Ban Lists',  type: 'BAN'       },
  { label: 'Whitelist',  type: 'WHITELIST' },
  { label: 'Admin List', type: 'ADMIN'     },
];

export default function AccessControl() {
  const { activeServer } = useServer();
  const [lists,      setLists]      = useState<AccessList[]>([]);
  const [entries,    setEntries]    = useState<ListEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);

  // New list form
  const [showAddList,  setShowAddList]  = useState(false);
  const [newListName,  setNewListName]  = useState('');
  const [newListType,  setNewListType]  = useState('BAN');
  const [newListScope, setNewListScope] = useState('SERVER');
  const [newListUrl,   setNewListUrl]   = useState('');

  // New entry form
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newSteamId,   setNewSteamId]   = useState('');
  const [newNote,      setNewNote]      = useState('');
  const [newPerm,      setNewPerm]      = useState('admin');

  const loadLists = () => {
    setLoading(true);
    api.get<AccessList[]>('/lists')
      .then(data => {
        setLists(data);
        if (!selectedId && data.length > 0) setSelectedId(data[0]!.id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const loadEntries = (listId: string) => {
    api.get<{ id: string; entries: ListEntry[] }>(`/lists/${listId}`)
      .then(data => setEntries(data.entries ?? []))
      .catch(console.error);
  };

  useEffect(() => { loadLists(); }, []);
  useEffect(() => { if (selectedId) loadEntries(selectedId); }, [selectedId]);

  const selected = lists.find(l => l.id === selectedId) ?? null;

  const deleteEntry = (steamId: string) => {
    if (!selectedId) return;
    api.delete(`/lists/${selectedId}/entries/${steamId}`)
      .then(() => setEntries(e => e.filter(x => x.steamId !== steamId)))
      .catch(console.error);
  };

  const syncList = () => {
    if (!selectedId || !activeServer?.id) return;
    api.post(`/lists/${selectedId}/sync/${activeServer.id}`)
      .then(() => alert('Synced to server successfully.'))
      .catch(e => alert(`Sync failed: ${(e as Error).message}`));
  };

  const refreshFeed = () => {
    if (!selectedId) return;
    api.post<{ imported: number }>(`/lists/${selectedId}/refresh`)
      .then(r => {
        alert(`Feed refreshed — ${r.imported} entries imported.`);
        if (selectedId) loadEntries(selectedId);
        loadLists();
      })
      .catch(e => alert(`Refresh failed: ${(e as Error).message}`));
  };

  const createList = () => {
    if (!newListName.trim()) return;
    api.post<AccessList>('/lists', {
      name: newListName,
      type: newListType,
      scope: newListScope,
      externalUrl: newListScope === 'EXTERNAL' ? newListUrl || null : null,
    })
      .then(created => {
        setShowAddList(false);
        setNewListName(''); setNewListUrl('');
        loadLists();
        setSelectedId(created.id);
      })
      .catch(e => alert(`Failed: ${(e as Error).message}`));
  };

  const addEntry = () => {
    if (!selectedId || !newSteamId.trim()) return;
    const body = selected?.type === 'ADMIN'
      ? { steamId: newSteamId, note: newNote || null, permissionLevel: newPerm }
      : { steamId: newSteamId, note: newNote || null };
    api.post(`/lists/${selectedId}/entries`, body)
      .then(() => {
        setShowAddEntry(false);
        setNewSteamId(''); setNewNote('');
        if (selectedId) loadEntries(selectedId);
        loadLists();
      })
      .catch(e => alert(`Failed: ${(e as Error).message}`));
  };

  const addLabel = !selected ? '+ Add'
    : selected.type === 'BAN'       ? '+ Add Ban'
    : selected.type === 'WHITELIST' ? '+ Add Player'
    : '+ Add Admin';

  return (
    <div className="main fadein">
      <PageHeader
        title="Access Control"
        subtitle="Manage ban lists, whitelists, and admin rosters · Global · Per-server · External feeds"
        actions={
          <div className="btn-group">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddList(true)}>+ New List</button>
            {selected && !selected.readonly && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddEntry(true)}>{addLabel}</button>
            )}
          </div>
        }
      />

      {/* ── Add List Modal ──────────────────────────────────── */}
      {showAddList && (
        <div className="overlay" onClick={() => setShowAddList(false)}>
          <div className="modal fadein" onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <span className="card-title">New Access List</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowAddList(false)}>✕</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Name</div></div>
                <input className="text-input" value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="My Ban List" />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Type</div></div>
                <select className="sel-input" value={newListType} onChange={e => setNewListType(e.target.value)}>
                  <option value="BAN">Ban List</option>
                  <option value="WHITELIST">Whitelist</option>
                  <option value="ADMIN">Admin List</option>
                </select>
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Scope</div></div>
                <select className="sel-input" value={newListScope} onChange={e => setNewListScope(e.target.value)}>
                  <option value="GLOBAL">Global (all servers)</option>
                  <option value="SERVER">Server-specific</option>
                  <option value="EXTERNAL">External URL feed</option>
                </select>
              </div>
              {newListScope === 'EXTERNAL' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <div className="setting-info">
                    <div className="setting-name">Feed URL</div>
                    <div className="setting-desc">Plain-text file of SteamID64s, one per line</div>
                  </div>
                  <input className="text-input" value={newListUrl} onChange={e => setNewListUrl(e.target.value)}
                    placeholder="https://example.com/banlist.txt" style={{ width: '260px' }} />
                </div>
              )}
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAddList(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createList} disabled={!newListName.trim()}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Entry Modal ─────────────────────────────────── */}
      {showAddEntry && selected && (
        <div className="overlay" onClick={() => setShowAddEntry(false)}>
          <div className="modal fadein" onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <span className="card-title">{addLabel}</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowAddEntry(false)}>✕</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Steam ID</div></div>
                <input className="text-input" value={newSteamId} onChange={e => setNewSteamId(e.target.value)} placeholder="76561198000000000" />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info"><div className="setting-name">Note / Reason</div></div>
                <input className="text-input" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Optional note" />
              </div>
              {selected.type === 'ADMIN' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <div className="setting-info"><div className="setting-name">Permission</div></div>
                  <select className="sel-input" value={newPerm} onChange={e => setNewPerm(e.target.value)}>
                    <option value="server">server</option>
                    <option value="admin">admin</option>
                    <option value="operator">operator</option>
                    <option value="client">client</option>
                  </select>
                </div>
              )}
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAddEntry(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={addEntry} disabled={!newSteamId.trim()}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="split-panel">
        {/* ── Left sidebar: list selector ────────────────────── */}
        <div className="sidebar">
          {loading && (
            <div style={{ padding: '12px', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '11px' }}>Loading…</div>
          )}
          {groups.map(g => {
            const listsOfType = lists.filter(l => l.type === g.type);
            return (
              <div key={g.type}>
                <div className="sidebar-group-label">{g.label}</div>
                {listsOfType.length === 0 && (
                  <div style={{ padding: '6px 12px', color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--mono)' }}>None</div>
                )}
                {listsOfType.map(l => (
                  <div
                    key={l.id}
                    className={`sidebar-item${l.id === selectedId ? ' active' : ''}`}
                    onClick={() => setSelectedId(l.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sidebar-item-name">{l.name}</div>
                      <ScopeBadge scope={l.scope} />
                    </div>
                    <span className="sidebar-item-count">{l.entryCount}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── Right panel: selected list contents ─────────────── */}
        <div className="col">
          {!selected ? (
            <EmptyState icon="⊘" title="No list selected" desc="Choose a list from the sidebar, or create a new one." />
          ) : (
            <div className="card fadein" key={selectedId ?? ''}>
              <div className="card-header">
                <div className="row">
                  <span className="card-title">{selected.name}</span>
                  <ScopeBadge scope={selected.scope} />
                </div>
                <div className="row">
                  {selected.readonly  && <span className="card-meta">read-only</span>}
                  {selected.syncedAt  && <span className="card-meta">synced {new Date(selected.syncedAt).toLocaleString()}</span>}
                </div>
              </div>

              {selected.scope === 'EXTERNAL' && (
                <div className="info-banner" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
                  ℹ Read-only feed · entries are merged into server ban files on sync.
                  {selected.externalUrl && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--dim)', marginLeft: '8px' }}>{selected.externalUrl}</span>
                  )}
                  <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={refreshFeed}>Refresh Feed</button>
                </div>
              )}

              {selected.scope !== 'EXTERNAL' && activeServer && (
                <div className="info-banner" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
                  Sync this list to <strong style={{ margin: '0 4px' }}>{activeServer.name}</strong>
                  <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={syncList}>Sync Now</button>
                </div>
              )}

              {selected.type === 'WHITELIST' && (
                <div className="warn-banner" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
                  Whitelist is currently <strong style={{ margin: '0 4px' }}>disabled</strong>. Enable via
                  <span style={{ fontFamily: 'var(--mono)', margin: '0 5px', color: 'var(--text)' }}>setserversetting IsWhitelisted true</span>
                  or in Server Settings.
                </div>
              )}

              {entries.length === 0 ? (
                <EmptyState icon="⊘" title="No entries" desc="This list is empty." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Steam ID</th>
                      {selected.type === 'ADMIN' && <th>Permission</th>}
                      <th>Note</th>
                      <th>Added</th>
                      {!selected.readonly && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.steamId}>
                        <td className="mono bright">{e.steamId}</td>
                        {selected.type === 'ADMIN' && (
                          <td><span className={`perm perm-${e.permissionLevel ?? 'client'}`}>[{e.permissionLevel ?? 'client'}]</span></td>
                        )}
                        <td style={{ color: 'var(--muted)' }}>{e.note ?? '—'}</td>
                        <td className="mono" style={{ color: 'var(--dim)' }}>{new Date(e.createdAt).toLocaleDateString()}</td>
                        {!selected.readonly && (
                          <td>
                            <button className="btn btn-danger btn-xs" onClick={() => deleteEntry(e.steamId)}>Remove</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
