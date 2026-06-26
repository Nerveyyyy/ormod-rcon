import { useState, type FormEvent, type JSX } from 'react'
import { useVerifyBackupCode, useVerifyTotp } from './mutations'

interface Props {
  onComplete: () => void
}

export const TwoFactorForm = ({ onComplete }: Props): JSX.Element => {
  const verifyTotp = useVerifyTotp()
  const verifyBackup = useVerifyBackupCode()
  const [useBackup, setUseBackup] = useState(false)
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)

  const error = useBackup ? verifyBackup.error : verifyTotp.error
  const pending = verifyTotp.isPending || verifyBackup.isPending

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const onSuccess = (): void => {
      onComplete()
    }
    if (useBackup) {
      verifyBackup.mutate({ code }, { onSuccess })
      return
    }
    verifyTotp.mutate({ code, trustDevice }, { onSuccess })
  }

  return (
    <form className="auth-form auth-form--stacked" onSubmit={onSubmit}>
      {error && <div className="auth-error">{error.message}</div>}

      <div className="auth-form-group">
        <label className="auth-form-label" htmlFor="totp-code">
          {useBackup ? 'Backup code' : 'Authentication code'}
        </label>
        <div className="auth-field">
          <input
            id="totp-code"
            inputMode={useBackup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder={useBackup ? 'Backup code' : '123456'}
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
            }}
          />
        </div>
      </div>

      {!useBackup && (
        <label className="auth-form-label" htmlFor="trust-device">
          <input
            id="trust-device"
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => {
              setTrustDevice(e.target.checked)
            }}
          />{' '}
          Trust this device
        </label>
      )}

      <button type="submit" className="auth-submit" disabled={pending}>
        {pending ? 'Verifying...' : 'Verify'}
      </button>

      <button
        type="button"
        className="auth-field-toggle"
        style={{ position: 'static', width: 'auto' }}
        onClick={() => {
          setUseBackup((v) => {
            return !v
          })
          setCode('')
        }}
      >
        {useBackup ? 'Use an authenticator code' : 'Use a backup code'}
      </button>
    </form>
  )
}
