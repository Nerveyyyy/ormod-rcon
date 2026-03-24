import { useState, useEffect, useRef } from 'react'
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
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    function handleTab(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [])

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && valid && !loading) submit()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal fadein"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-modal-title"
      >
        <div className="card-header">
          <span className="card-title" id="change-password-modal-title">Change Password</span>
          <button
            className="btn btn-ghost btn-xs"
            onClick={onClose}
            aria-label="Close dialog"
          >
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
              role="alert"
            >
              Password changed successfully.
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="change-pw-current"
                  className="setting-name"
                  style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}
                >
                  Current Password
                </label>
                <input
                  id="change-pw-current"
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
                  htmlFor="change-pw-new"
                  className="setting-name"
                  style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}
                >
                  New Password
                </label>
                <input
                  id="change-pw-new"
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
                    role="alert"
                  >
                    Minimum 8 characters
                  </div>
                )}
              </div>
              <div>
                <label
                  htmlFor="change-pw-confirm"
                  className="setting-name"
                  style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}
                >
                  Confirm New Password
                </label>
                <input
                  id="change-pw-confirm"
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
                    role="alert"
                  >
                    Passwords do not match
                  </div>
                )}
              </div>
              {error && (
                <div
                  style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'var(--mono)' }}
                  role="alert"
                >
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
