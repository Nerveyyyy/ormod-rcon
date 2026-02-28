import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { api } from '../../api/client.js'

type Props = {
  onClose: () => void
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const valid =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword

  const submit = async () => {
    if (!valid) return
    setError('')
    setLoading(true)
    try {
      await api.post('/users/me/password', { currentPassword, newPassword })
      setSuccess(true)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        onClose()
      }, 1200)
    } catch (e) {
      setError((e as Error).message || 'Password change failed')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && valid && !loading) submit()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal fadein"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="card-header">
          <span className="card-title">Change Password</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>
            ✕
          </button>
        </div>
        <div
          className="card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          {success ? (
            <div
              style={{
                color: 'var(--green)',
                fontFamily: 'var(--mono)',
                fontSize: '12px',
                padding: '12px 0',
              }}
            >
              Password changed successfully.
            </div>
          ) : (
            <>
              <div>
                <label
                  className="setting-name"
                  style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}
                >
                  Current Password
                </label>
                <input
                  className="text-input text-input-full"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>
              <div>
                <label
                  className="setting-name"
                  style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}
                >
                  New Password
                </label>
                <input
                  className="text-input text-input-full"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {newPassword.length > 0 && newPassword.length < 8 && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'var(--red)',
                      marginTop: '4px',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    Minimum 8 characters
                  </div>
                )}
              </div>
              <div>
                <label
                  className="setting-name"
                  style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}
                >
                  Confirm New Password
                </label>
                <input
                  className="text-input text-input-full"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'var(--red)',
                      marginTop: '4px',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    Passwords do not match
                  </div>
                )}
              </div>
              {error && (
                <div style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
                  {error}
                </div>
              )}
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={submit} disabled={!valid || loading}>
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
