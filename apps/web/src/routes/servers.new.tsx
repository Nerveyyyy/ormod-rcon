import { useState, type FormEvent, type JSX } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { ApiError, createServer } from '@/lib/api'

export const NewServerPage = (): JSX.Element => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [ handle, setHandle ] = useState('')
  const [ name, setName ] = useState('')
  const [ region, setRegion ] = useState('')
  const [ rconHost, setRconHost ] = useState('')
  const [ rconPort, setRconPort ] = useState(28016)
  const [ rconPassword, setRconPassword ] = useState('')
  const [ err, setErr ] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createServer,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [ 'servers' ] })
      void navigate({
        to: '/servers/$id',
        params: { id: result.id },
        replace: true,
      })
    },
    onError: (e) => {
      if (e instanceof ApiError) setErr(e.message)
      else setErr('Could not register the server.')
    },
  })

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setErr(null)
    mutation.mutate({
      handle,
      name,
      region: region || undefined,
      rconHost,
      rconPort,
      rconPassword,
    })
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <button
            type="button"
            className="back-link"
            onClick={() => { void navigate({ to: '/servers' }) }}
          >
            ← Back to servers
          </button>
          <div className="page-title">Register a server</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="card-head">
          <div className="card-name">Connection</div>
        </div>
        <div className="card-body">
          <form className="form" onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="srv-handle">
                Handle
                <span className="hint">short slug used in URLs and logs</span>
              </label>
              <input
                id="srv-handle"
                className="form-input mono"
                type="text"
                value={handle}
                required
                pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
                maxLength={64}
                onChange={(e) => { setHandle(e.target.value) }}
                placeholder="eu-main-01"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="srv-name">
                Display name
              </label>
              <input
                id="srv-name"
                className="form-input"
                type="text"
                value={name}
                required
                maxLength={128}
                onChange={(e) => { setName(e.target.value) }}
                placeholder="EU Main — PvP"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="srv-region">
                Region
                <span className="hint">optional</span>
              </label>
              <input
                id="srv-region"
                className="form-input"
                type="text"
                value={region}
                maxLength={32}
                onChange={(e) => { setRegion(e.target.value) }}
                placeholder="EU"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="srv-host">
                  RCON host
                </label>
                <input
                  id="srv-host"
                  className="form-input mono"
                  type="text"
                  value={rconHost}
                  required
                  onChange={(e) => { setRconHost(e.target.value) }}
                  placeholder="rcon.example.com"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="srv-port">
                  Port
                </label>
                <input
                  id="srv-port"
                  className="form-input mono"
                  type="number"
                  value={rconPort}
                  required
                  min={1}
                  max={65535}
                  onChange={(e) => { setRconPort(Number(e.target.value)) }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="srv-secret">
                RCON password
                <span className="hint">encrypted at rest</span>
              </label>
              <input
                id="srv-secret"
                className="form-input mono"
                type="password"
                value={rconPassword}
                required
                onChange={(e) => { setRconPassword(e.target.value) }}
              />
              <div className="form-hint">
                To change this later, delete and re-add the server.
              </div>
            </div>

            {err && <div className="form-error">{err}</div>}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { void navigate({ to: '/servers' }) }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Registering…' : 'Register server'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  )
}
