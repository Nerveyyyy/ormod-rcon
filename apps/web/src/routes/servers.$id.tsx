import type { JSX } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { deleteServer, fetchServer } from '@/lib/api'
import type { ServerDetail, ServerRuntime } from '@ormod/contracts'

const stateBadgeClass = (state: ServerRuntime['state']): string => {
  switch (state) {
    case 'connected':
      return 'badge-green'
    case 'connecting':
      return 'badge-orange'
    case 'errored':
      return 'badge-red'
    case 'disconnected':
    default:
      return 'badge-muted'
  }
}

const stateDotClass = (state: ServerRuntime['state']): string => {
  switch (state) {
    case 'connected':
      return 'dot-on'
    case 'connecting':
      return 'dot-warn'
    case 'errored':
      return 'dot-err'
    case 'disconnected':
    default:
      return 'dot-off'
  }
}

const formatTimestamp = (iso: string | null): string => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const RuntimePanel = ({
  runtime,
}: {
  runtime: ServerDetail['runtime']
}): JSX.Element => {
  if (!runtime) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-name">Live status</div>
        </div>
        <div className="card-body muted">
          Supervisor has not reported yet — the first status should arrive in a
          few seconds.
        </div>
      </div>
    )
  }

  const stateLabel = runtime.state.charAt(0).toUpperCase() + runtime.state.slice(1)

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-name">
          <span className="live-dot" />
          Live status
        </div>
        <span className={`badge ${ stateBadgeClass(runtime.state) }`}>
          {runtime.state}
        </span>
      </div>
      <div className="card-body">
        <div className="kv-row">
          <span className="kv-label">Connection</span>
          <span className="kv-value">
            <span className={`dot ${ stateDotClass(runtime.state) }`} />
            {stateLabel}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Players online</span>
          <span className="kv-value">
            {runtime.playerCount === null ? '—' : runtime.playerCount}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Latency</span>
          <span className="kv-value">
            {runtime.latencyMs === null ? '—' : `${ runtime.latencyMs }ms`}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Last connected</span>
          <span className="kv-value">{formatTimestamp(runtime.lastConnectedAt)}</span>
        </div>
      </div>
    </div>
  )
}

export const ServerDetailPage = (): JSX.Element => {
  const params = useParams({ from: '/servers/$id' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [ 'servers', params.id ],
    queryFn: () => { return fetchServer(params.id) },
    refetchInterval: 2_000,
  })

  const deletion = useMutation({
    mutationFn: () => { return deleteServer(params.id) },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [ 'servers' ] })
      void navigate({ to: '/servers', replace: true })
    },
  })

  const onDelete = (): void => {
    const ok = window.confirm(
      'Remove this server? The RCON supervisor will close the live connection and the row will be deleted. This cannot be undone.',
    )
    if (ok) deletion.mutate()
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
          <div className="page-title">
            {query.data?.name ?? 'Server'}
            {query.data && (
              <span className="page-title-sub mono">{query.data.handle}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            disabled={deletion.isPending}
          >
            {deletion.isPending ? 'Removing…' : 'Delete'}
          </button>
        </div>
      </div>

      {query.isPending && <div className="card card-body muted">Loading…</div>}

      {query.isError && (
        <div className="form-error">Could not load server: {String(query.error)}</div>
      )}

      {query.data && (
        <div className="grid-2">
          <RuntimePanel runtime={query.data.runtime} />

          <div className="card">
            <div className="card-head">
              <div className="card-name">Connection</div>
            </div>
            <div className="card-body">
              <div className="kv-row">
                <span className="kv-label">Handle</span>
                <span className="kv-value">{query.data.handle}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Region</span>
                <span className="kv-value">{query.data.region ?? '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">RCON host</span>
                <span className="kv-value">{query.data.rconHost}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">RCON port</span>
                <span className="kv-value">{query.data.rconPort}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Enabled</span>
                <span className="kv-value">
                  <span
                    className={`badge ${
                      query.data.enabled ? 'badge-green' : 'badge-muted'
                    }`}
                  >
                    {query.data.enabled ? 'Yes' : 'No'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
