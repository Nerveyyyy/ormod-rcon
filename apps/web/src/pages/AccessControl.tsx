import { useState, useEffect, useRef } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import EmptyState from '../components/ui/EmptyState.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import { useServerContext as useServer } from '../context/ServerContext.js'
import { api } from '../api/client.js'

type AccessList = {
  id: string
  slug: string
  name: string
  type: string
  scope: string
  readonly: boolean
  syncedAt: string | null
  externalUrl: string | null
  entryCount: number
}

type ListEntry = {
  steamId: string
  displayName: string | null
  reason: string | null
  addedBy: string | null
  createdAt: string
  permission: string | null
}

function ScopeBadge({ scope }: { scope: string }) {
  return <span className={`scope scope-${scope.toLowerCase()}`}>{scope.toLowerCase()}</span>
}

const groups = [
  { label: 'Ban Lists', type: 'BAN' },
  { label: 'Whitelist', type: 'WHITELIST' },
  { label: 'Admin List', type: 'ADMIN' },
]

function useFocusTrap(isOpen: boolean, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!isOpen) return
    const modal = ref.current
    if (!modal) return
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [isOpen, ref])
}

export default function AccessControl() {
  const { activeServer } = useServer()
  const [lists, setLists] = useState<AccessList[]>([])
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New list form
  const [showAddList, setShowAddList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListType, setNewListType] = useState('BAN')
  const [newListScope, setNewListScope] = useState('SERVER')
  const [newListUrl, setNewListUrl] = useState('')

  // New entry form
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [newSteamId, setNewSteamId] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newPerm, setNewPerm] = useState('admin')

  const [deleteTarget, setDeleteTarget] = useState<AccessList | null>(null)
  const [removeTarget, setRemoveTarget] = useState<ListEntry | null>(null)

  // Modal refs for focus traps
  const addListModalRef = useRef<HTMLDivElement>(null)
  const addEntryModalRef = useRef<HTMLDivElement>(null)

  useFocusTrap(showAddList, addListModalRef)
  useFocusTrap(showAddEntry, addEntryModalRef)

  const loadLists = () => {
    setLoading(true)
    api
      .get<AccessList[]>('/lists')
      .then((data) => {
        setLists(data)
        if (!selectedSlug && data.length > 0) setSelectedSlug(data[0]!.slug)
      })
      .catch((e) => setError((e as Error).message || 'Failed to load lists'))
      .finally(() => setLoading(false))
  }

  const loadEntries = (slug: string) => {
    api
      .get<{ slug: string; entries: ListEntry[] }>(`/lists/${slug}`)
      .then((data) => setEntries(data.entries ?? []))
      .catch((e) => setError((e as Error).message || 'Failed to load entries'))
  }

  useEffect(() => {
    loadLists()
  }, [])
  useEffect(() => {
    if (selectedSlug) loadEntries(selectedSlug)
  }, [selectedSlug])

  const selected = lists.find((l) => l.slug === selectedSlug) ?? null

  const deleteEntry = () => {
    if (!selectedSlug || !removeTarget) return
    const steamId = removeTarget.steamId
    setRemoveTarget(null)
    api
      .delete(`/lists/${selectedSlug}/entries/${steamId}`)
      .then(() => setEntries((e) => e.filter((x) => x.steamId !== steamId)))
      .catch((e) => setError((e as Error).message || 'Failed to remove entry'))
  }

  const syncList = () => {
    if (!selectedSlug || !activeServer?.serverName) return
    api
      .post(`/lists/${selectedSlug}/sync/${activeServer.serverName}`)
      .then(() => setError(null))
      .catch((e) => setError(`Sync failed: ${(e as Error).message}`))
  }

  const deleteList = () => {
    if (!deleteTarget) return
    api
      .delete(`/lists/${deleteTarget.slug}`)
      .then(() => {
        setDeleteTarget(null)
        if (selectedSlug === deleteTarget.slug) {
          setSelectedSlug(null)
          setEntries([])
        }
        loadLists()
      })
      .catch((e) => setError(`Failed to delete list: ${(e as Error).message}`))
  }

  const refreshFeed = () => {
    if (!selectedSlug) return
    api
      .post<{ imported: number }>(`/lists/${selectedSlug}/refresh`)
      .then((r) => {
        if (selectedSlug) loadEntries(selectedSlug)
        loadLists()
        setError(null)
        // Show success inline rather than alert
        console.log(`Feed refreshed — ${r.imported} entries imported.`)
      })
      .catch((e) => setError(`Refresh failed: ${(e as Error).message}`))
  }

  const createList = () => {
    if (!newListName.trim()) return
    api
      .post<AccessList>('/lists', {
        name: newListName,
        type: newListType,
        scope: newListScope,
        externalUrl: newListScope === 'EXTERNAL' ? newListUrl || null : null,
      })
      .then((created) => {
        setShowAddList(false)
        setNewListName('')
        setNewListUrl('')
        loadLists()
        setSelectedSlug(created.slug)
      })
      .catch((e) => setError(`Failed to create list: ${(e as Error).message}`))
  }

  const addEntry = () => {
    if (!selectedSlug || !newSteamId.trim()) return
    const body =
      selected?.type === 'ADMIN'
        ? { steamId: newSteamId, reason: newNote || null, permission: newPerm }
        : { steamId: newSteamId, reason: newNote || null }
    api
      .post(`/lists/${selectedSlug}/entries`, body)
      .then(() => {
        setShowAddEntry(false)
        setNewSteamId('')
        setNewNote('')
        if (selectedSlug) loadEntries(selectedSlug)
        loadLists()
      })
      .catch((e) => setError(`Failed to add entry: ${(e as Error).message}`))
  }

  const addLabel = !selected
    ? '+ Add'
    : selected.type === 'BAN'
      ? '+ Add Ban'
      : selected.type === 'WHITELIST'
        ? '+ Add Player'
        : '+ Add Admin'

  return (
    <div className="main fadein">
      <PageHeader
        title="Access Control"
        subtitle="Manage ban lists, whitelists, and admin rosters · Global · Per-server · External feeds"
        actions={
          <div className="btn-group">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddList(true)} disabled={!activeServer?.running}>
              + New List
            </button>
            {selected && !selected.readonly && selected.scope !== 'EXTERNAL' && activeServer?.running && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddEntry(true)}>
                {addLabel}
              </button>
            )}
          </div>
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
          Server is offline — access list changes won't be synced until the server is running.
        </div>
      )}

      {/* ── Add List Modal ──────────────────────────────────── */}
      {showAddList && (
        <div className="overlay" onClick={() => setShowAddList(false)}>
          <div
            ref={addListModalRef}
            className="modal fadein"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-list-modal-title"
          >
            <div className="card-header">
              <span className="card-title" id="add-list-modal-title">New Access List</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setShowAddList(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div
              className="card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="new-list-name" className="setting-info">
                  <div className="setting-name">Name</div>
                </label>
                <input
                  id="new-list-name"
                  className="text-input"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="My Ban List"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="new-list-type" className="setting-info">
                  <div className="setting-name">Type</div>
                </label>
                <select
                  id="new-list-type"
                  className="sel-input"
                  value={newListType}
                  onChange={(e) => setNewListType(e.target.value)}
                >
                  <option value="BAN">Ban List</option>
                  <option value="WHITELIST">Whitelist</option>
                  <option value="ADMIN">Admin List</option>
                </select>
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="new-list-scope" className="setting-info">
                  <div className="setting-name">Scope</div>
                </label>
                <select
                  id="new-list-scope"
                  className="sel-input"
                  value={newListScope}
                  onChange={(e) => setNewListScope(e.target.value)}
                >
                  <option value="GLOBAL">Global (all servers)</option>
                  <option value="SERVER">Server-specific</option>
                  <option value="EXTERNAL">External URL feed</option>
                </select>
              </div>
              {newListScope === 'EXTERNAL' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <label htmlFor="new-list-url" className="setting-info">
                    <div className="setting-name">Feed URL</div>
                    <div className="setting-desc">Plain-text file of SteamID64s, one per line</div>
                  </label>
                  <input
                    id="new-list-url"
                    className="text-input"
                    value={newListUrl}
                    onChange={(e) => setNewListUrl(e.target.value)}
                    placeholder="https://example.com/banlist.txt"
                    style={{ width: '260px' }}
                  />
                </div>
              )}
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAddList(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={createList}
                  disabled={!newListName.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Entry Modal ─────────────────────────────────── */}
      {showAddEntry && selected && (
        <div className="overlay" onClick={() => setShowAddEntry(false)}>
          <div
            ref={addEntryModalRef}
            className="modal fadein"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-entry-modal-title"
          >
            <div className="card-header">
              <span className="card-title" id="add-entry-modal-title">{addLabel}</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setShowAddEntry(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div
              className="card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="new-entry-steamid" className="setting-info">
                  <div className="setting-name">Steam ID</div>
                </label>
                <input
                  id="new-entry-steamid"
                  className="text-input"
                  value={newSteamId}
                  onChange={(e) => setNewSteamId(e.target.value)}
                  placeholder="76561198000000000"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="new-entry-note" className="setting-info">
                  <div className="setting-name">Note / Reason</div>
                </label>
                <input
                  id="new-entry-note"
                  className="text-input"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Optional note"
                />
              </div>
              {selected.type === 'ADMIN' && (
                <div className="setting-row" style={{ padding: 0 }}>
                  <label htmlFor="new-entry-perm" className="setting-info">
                    <div className="setting-name">Permission</div>
                  </label>
                  <select
                    id="new-entry-perm"
                    className="sel-input"
                    value={newPerm}
                    onChange={(e) => setNewPerm(e.target.value)}
                  >
                    <option value="server">server</option>
                    <option value="admin">admin</option>
                    <option value="operator">operator</option>
                    <option value="client">client</option>
                  </select>
                </div>
              )}
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAddEntry(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={addEntry}
                  disabled={!newSteamId.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Access List"
          confirmWord={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteList}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
            This will permanently delete the list{' '}
            <strong style={{ color: 'var(--orange)' }}>{deleteTarget.name}</strong> and
            all {deleteTarget.entryCount} entries. This cannot be undone.
          </div>
        </ConfirmDialog>
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove Entry"
          onCancel={() => setRemoveTarget(null)}
          onConfirm={deleteEntry}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
            Are you sure you want to remove{' '}
            <strong style={{ color: 'var(--text-bright)' }}>
              {removeTarget.displayName ?? removeTarget.steamId}
            </strong>
            {removeTarget.displayName && (
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--dim)', marginLeft: '4px' }}>
                ({removeTarget.steamId})
              </span>
            )}
            {' '}from <strong style={{ color: 'var(--orange)' }}>{selected?.name}</strong>?
          </div>
        </ConfirmDialog>
      )}

      <div className="split-panel">
        {/* ── Left sidebar: list selector ────────────────────── */}
        <div className="sidebar">
          {loading && (
            <div
              style={{
                padding: '12px',
                color: 'var(--dim)',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
              }}
            >
              Loading…
            </div>
          )}
          {groups.map((g) => {
            const listsOfType = lists.filter((l) => l.type === g.type)
            return (
              <div key={g.type}>
                <div className="sidebar-group-label">{g.label}</div>
                {listsOfType.length === 0 && (
                  <div
                    style={{
                      padding: '6px 12px',
                      color: 'var(--dim)',
                      fontSize: '11px',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    None
                  </div>
                )}
                {listsOfType.map((l) => (
                  <div
                    key={l.slug}
                    className={`sidebar-item${l.slug === selectedSlug ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSlug(l.slug)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedSlug(l.slug)
                      }
                    }}
                    aria-pressed={l.slug === selectedSlug}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sidebar-item-name">{l.name}</div>
                      <ScopeBadge scope={l.scope} />
                    </div>
                    <span className="sidebar-item-count">{l.entryCount}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* ── Right panel: selected list contents ─────────────── */}
        <div className="col">
          {!selected ? (
            <EmptyState
              icon="⊘"
              title="No list selected"
              desc="Choose a list from the sidebar, or create a new one."
            />
          ) : (
            <div className="card fadein" key={selectedSlug ?? ''}>
              <div className="card-header">
                <div className="row">
                  <span className="card-title">{selected.name}</span>
                  <ScopeBadge scope={selected.scope} />
                </div>
                <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                  {selected.readonly && <span className="card-meta">read-only</span>}
                  {selected.syncedAt && (
                    <span className="card-meta">
                      synced {new Date(selected.syncedAt).toLocaleString()}
                    </span>
                  )}
                  <button
                    className="btn btn-danger btn-xs"
                    onClick={() => setDeleteTarget(selected)}
                    disabled={!activeServer?.running}
                  >
                    Delete List
                  </button>
                </div>
              </div>

              {selected.scope === 'EXTERNAL' && (
                <div
                  className="info-banner"
                  style={{
                    borderRadius: 0,
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                  }}
                >
                  ℹ Read-only feed · entries are merged into server ban files on sync.
                  {selected.externalUrl && (
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: '10px',
                        color: 'var(--dim)',
                        marginLeft: '8px',
                      }}
                    >
                      {selected.externalUrl}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ marginLeft: 'auto' }}
                    onClick={refreshFeed}
                    disabled={!activeServer?.running}
                  >
                    Refresh Feed
                  </button>
                </div>
              )}

              {selected.scope !== 'EXTERNAL' && activeServer && (
                <div
                  className="info-banner"
                  style={{
                    borderRadius: 0,
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                  }}
                >
                  Sync this list to <strong style={{ margin: '0 4px' }}>{activeServer.name}</strong>
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ marginLeft: 'auto' }}
                    onClick={syncList}
                    disabled={!activeServer?.running}
                  >
                    Sync Now
                  </button>
                </div>
              )}

              {selected.type === 'WHITELIST' && (
                <div
                  className="info-banner"
                  style={{
                    borderRadius: 0,
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                    color: 'var(--orange)',
                    background: 'var(--orange-bg)',
                    borderColor: 'var(--orange-dim)',
                  }}
                >
                  Whitelists must be enabled in server settings for this list to take effect.
                </div>
              )}


              {entries.length === 0 ? (
                <EmptyState icon="⊘" title="No entries" desc="This list is empty." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Steam ID</th>
                      {selected.type === 'ADMIN' && <th scope="col">Permission</th>}
                      <th scope="col">Note</th>
                      <th scope="col">Added</th>
                      {!selected.readonly && <th scope="col">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.steamId}>
                        <td className="bright">{e.displayName ?? '—'}</td>
                        <td className="mono bright">{e.steamId}</td>
                        {selected.type === 'ADMIN' && (
                          <td>
                            <span className={`perm perm-${e.permission ?? 'client'}`}>
                              [{e.permission ?? 'client'}]
                            </span>
                          </td>
                        )}
                        <td style={{ color: 'var(--muted)' }}>{e.reason ?? '—'}</td>
                        <td className="mono" style={{ color: 'var(--dim)' }}>
                          {new Date(e.createdAt).toLocaleDateString()}
                        </td>
                        {!selected.readonly && (
                          <td>
                            <button
                              className="btn btn-danger btn-xs"
                              onClick={() => setRemoveTarget(e)}
                            >
                              Remove
                            </button>
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
  )
}
