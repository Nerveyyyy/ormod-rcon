import { useState, useEffect } from 'react'
import PageHeader from '../components/ui/PageHeader.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import { useAuth } from '../context/AuthContext.js'
import { api } from '../api/client.js'

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

  // Add form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER')
  const [addError, setAddError] = useState('')

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
      alert((e as Error).message || 'Failed to change role')
    }
  }

  const deleteUser = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/users/${deleteTarget.id}`)
      setDeleteTarget(null)
      fetchUsers()
    } catch (e) {
      alert((e as Error).message || 'Failed to delete user')
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

      {/* ── Create User Modal ──────────────────────────────── */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div
            className="modal fadein"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
          >
            <div className="card-header">
              <span className="card-title">Create User</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(false)}>
                ✕
              </button>
            </div>
            <div
              className="card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Name</div>
                </div>
                <input
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Email</div>
                </div>
                <input
                  className="text-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Password</div>
                  <div className="setting-desc">Minimum 8 characters</div>
                </div>
                <input
                  className="text-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="setting-row" style={{ padding: 0 }}>
                <div className="setting-info">
                  <div className="setting-name">Role</div>
                </div>
                <select
                  className="sel-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'ADMIN' | 'VIEWER')}
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              {addError && (
                <div style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
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
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = isSelf(u)
                const roleCls =
                  u.role === 'OWNER'
                    ? 'role-owner'
                    : u.role === 'ADMIN'
                      ? 'role-admin'
                      : 'role-viewer'
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
