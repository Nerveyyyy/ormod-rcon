import { useState, type FormEvent, type JSX } from 'react'
import { useChangePassword } from './mutations'

interface Props {
  onComplete: () => void
}

export const ChangePasswordForm = ({ onComplete }: Props): JSX.Element => {
  const changePassword = useChangePassword()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: (): void => {
          onComplete()
        },
      }
    )
  }

  return (
    <form className="auth-form auth-form--stacked" onSubmit={onSubmit}>
      {changePassword.error && (
        <div className="auth-error">{changePassword.error.message}</div>
      )}

      <div className="auth-form-group">
        <label className="auth-form-label" htmlFor="current-password">
          Current password
        </label>
        <div className="auth-field">
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value)
            }}
          />
        </div>
      </div>

      <div className="auth-form-group">
        <label className="auth-form-label" htmlFor="new-password">
          New password
        </label>
        <div className="auth-field">
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
            }}
          />
        </div>
      </div>

      <button
        type="submit"
        className="auth-submit"
        disabled={changePassword.isPending}
      >
        {changePassword.isPending ? 'Updating...' : 'Update password'}
      </button>
    </form>
  )
}
