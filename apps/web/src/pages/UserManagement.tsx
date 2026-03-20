import { useState, useEffect, useRef } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import { useAuth } from '../context/AuthContext.js'
import { api } from '../api/client.js'
import { roleToClass } from '../lib/constants.js'

type User = {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
}

export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'OWNER' | 'ADMIN' | 'VIEWER'>('VIEWER')
  const [addError, setAddError] = useState('')

  // Focus trap ref for Create User modal
  const addModalRef = useRef<HTMLDivElement>(null)

  // Focus trap effect for Create User modal
  useEffect(() => {
    if (!showAdd) return
    const modal = addModalRef.current
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
  }, [showAdd])

  const fetchUsers = async () => {
    try {
      const data = await api.get<User[]>('/users')
      setUsers(data)
    } catch {
      // RBAC will block non-OWNERs at the API level
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const addUser = async () => {
    if (!name.trim() || !email.trim() || password.length < 8) return
    setAddError('')
    try {
      await api.post('/users', { name, email, password, role })
      setShowAdd(false)
      setName('')
      setEmail('')
      setPassword('')
      setRole('VIEWER')
      fetchUsers()
    } catch (e) {
      setAddError((e as Error).message || 'Failed to create user')
    }
  }

  const changeRole = async (userId: string, newRole: string) => {
    try {
      await api.put(`/users/${userId}/role`, { role: newRole })
      fetchUsers()
    } catch (e) {
      setError((e as Error).message || 'Failed to change role')
    }
  }

  const deleteUser = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/users/${deleteTarget.id}`)
      setDeleteTarget(null)
      fetchUsers()
    } catch (e) {
      setError((e as Error).message || 'Failed to delete user')
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const isSelf = (u: User) => u.id === currentUser?.id

  return (
    <div className="main fadein">
      <PageHeader
        title="User Management"
        subtitle="Manage dashboard users, roles, and permissions"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Create User
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

      {/* ── Create User Modal ──────────────────────────────── */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div
            ref={addModalRef}
            className="modal fadein"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-modal-title"
          >
            <div className="card-header">
              <span className="card-title" id="create-user-modal-title">Create User</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setShowAdd(false)}
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
                <label htmlFor="create-user-name" className="setting-info">
                  <div className="setting-name">Name</div>
                </label>
                <input
                  id="create-user-name"
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="create-user-email" className="setting-info">
                  <div className="setting-name">Email</div>
                </label>
                <input
                  id="create-user-email"
                  className="text-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="create-user-password" className="setting-info">
                  <div className="setting-name">Password</div>
                  <div className="setting-desc">Minimum 8 characters</div>
                </label>
                <input
                  id="create-user-password"
                  className="text-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <label htmlFor="create-user-role" className="setting-info">
                  <div className="setting-name">Role</div>
                </label>
                <select
                  id="create-user-role"
                  className="sel-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'OWNER' | 'ADMIN' | 'VIEWER')}
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OWNER">Owner</option>
                </select>
              </div>
              {addError && (
                <div
                  style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'var(--mono)' }}
                  role="alert"
                >
                  {addError}
                </div>
              )}
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={addUser}
                  disabled={!name.trim() || !email.trim() || password.length < 8}
                >
                  Create User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ─────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete User"
          confirmWord={deleteTarget.email}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteUser}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
            This will permanently delete{' '}
            <strong style={{ color: 'var(--orange)' }}>{deleteTarget.name}</strong> (
            {deleteTarget.email}). All their sessions will be invalidated.
          </div>
        </ConfirmDialog>
      )}

      {/* ── Users Table ────────────────────────────────────── */}
      <div className="card">
        {loading ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: 'var(--dim)',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
            }}
          >
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: 'var(--dim)',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
            }}
          >
            No users found.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Created</th>
                <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = isSelf(u)
                const roleCls = roleToClass(u.role)
                return (
                  <tr key={u.id}>
                    <td className="bright">
                      {u.name}
                      {self && (
                        <span style={{ fontSize: '10px', color: 'var(--dim)', marginLeft: '6px' }}>
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="mono">{u.email}</td>
                    <td>
                      <span className={`role-badge ${roleCls}`}>[{u.role.toLowerCase()}]</span>
                    </td>
                    <td className="mono">{formatDate(u.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {!self && (
                        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                          <select
                            className="sel-input"
                            value={u.role}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            style={{ fontSize: '10px', padding: '3px 6px' }}
                            aria-label={`Change role for ${u.name}`}
                          >
                            <option value="OWNER">Owner</option>
                            <option value="ADMIN">Admin</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                          <button
                            className="btn btn-danger btn-xs"
                            onClick={() => setDeleteTarget(u)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
