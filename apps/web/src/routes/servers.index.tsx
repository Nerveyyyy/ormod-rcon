import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/app-shell'
import { IconPlus } from '@/components/icons'
import { fetchServers } from '@/lib/api'

export const ServersListPage = (): JSX.Element => {
  const query = useQuery({
    queryKey: [ 'servers' ],
    queryFn: () => { return fetchServers({ includeTotal: true }) },
  })

  const items = query.data?.data ?? []
  const total = query.data?.total ?? items.length

  return (
    <AppShell>
      <div className="page-head">
        <div className="page-title">
          Servers
          {query.data && (
            <span className="page-title-sub">{total} registered</span>
          )}
        </div>
        <Link to="/servers/new" className="btn btn-primary">
          <IconPlus size={14} />
          Add server
        </Link>
      </div>

      {query.isPending && <div className="card card-body muted">Loading servers…</div>}

      {query.isError && (
        <div className="form-error">
          Could not load servers: {String(query.error)}
        </div>
      )}

      {query.isSuccess && items.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-title">No servers yet</div>
            <div>
              Register your first server to start streaming RCON events and
              player activity into the dashboard.
            </div>
            <div style={{ marginTop: 14 }}>
              <Link to="/servers/new" className="btn btn-primary">
                <IconPlus size={14} />
                Add your first server
              </Link>
            </div>
          </div>
        </div>
      )}

      {query.isSuccess && items.length > 0 && (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Handle</th>
                <th>Name</th>
                <th style={{ width: 120 }}>Region</th>
                <th style={{ width: 110 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {items.map((server) => {
                return (
                  <tr key={server.id} className="clickable">
                    <td className="mono">
                      <Link
                        to="/servers/$id"
                        params={{ id: server.id }}
                        className="tbl-link"
                      >
                        {server.handle}
                      </Link>
                    </td>
                    <td>{server.name}</td>
                    <td className="mono muted">{server.region ?? '—'}</td>
                    <td>
                      <span
                        className={`badge ${
                          server.enabled ? 'badge-green' : 'badge-muted'
                        }`}
                      >
                        {server.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
