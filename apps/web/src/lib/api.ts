import type {
  CreateServerRequest,
  CreateServerResponse,
  ErrorDetail,
  ErrorEnvelope,
  HealthzResponse,
  ListServersResponse,
  ServerDetail,
  SetupRequest,
} from '@ormod/contracts'

export class ApiError extends Error {
  constructor (
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const readJsonBody = async (res: Response): Promise<unknown> => {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const isErrorEnvelope = (value: unknown): value is ErrorEnvelope => {
  if (!value || typeof value !== 'object') return false
  const error = (value as { error?: unknown }).error
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  return typeof e.code === 'string' && typeof e.message === 'string'
}

const errorFromBody = (status: number, statusText: string, body: unknown): ApiError => {
  if (isErrorEnvelope(body)) {
    return new ApiError(
      status,
      body.error.code,
      body.error.message,
      body.error.details,
      body,
    )
  }
  return new ApiError(status, 'error', `request failed: ${ status } ${ statusText }`, undefined, body)
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'
  body?: unknown
  query?: Record<string, string | number | undefined>
  /** Omit credentials for Better Auth routes that manage their own session flow. */
  credentials?: RequestCredentials
}

const buildUrl = (path: string, query?: RequestOpts['query']): string => {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [ key, value ] of Object.entries(query)) {
    if (value === undefined) continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${ path }?${ qs }` : path
}

const apiFetch = async (path: string, opts: RequestOpts = {}): Promise<Response> => {
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    credentials: opts.credentials ?? 'include',
    headers: {
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const body = await readJsonBody(res)
    throw errorFromBody(res.status, res.statusText, body)
  }
  return res
}

export const fetchHealth = async (): Promise<HealthzResponse> => {
  const res = await apiFetch('/healthz')
  return (await res.json()) as HealthzResponse
}

export const submitSetup = async (body: SetupRequest): Promise<void> => {
  await apiFetch('/api/setup', { method: 'POST', body })
}

export interface ListServersOpts {
  cursor?: string
  limit?: number
  sort?: string
  includeTotal?: boolean
}

export const fetchServers = async (
  opts: ListServersOpts = {},
): Promise<ListServersResponse> => {
  const res = await apiFetch('/api/servers', {
    query: {
      cursor: opts.cursor,
      limit: opts.limit,
      sort: opts.sort,
      include: opts.includeTotal ? 'total' : undefined,
    },
  })
  return (await res.json()) as ListServersResponse
}

export const fetchServer = async (id: string): Promise<ServerDetail> => {
  const res = await apiFetch(`/api/servers/${ encodeURIComponent(id) }`)
  return (await res.json()) as ServerDetail
}

export const createServer = async (
  body: CreateServerRequest,
): Promise<CreateServerResponse> => {
  const res = await apiFetch('/api/servers', { method: 'POST', body })
  return (await res.json()) as CreateServerResponse
}

export const deleteServer = async (id: string): Promise<void> => {
  await apiFetch(`/api/servers/${ encodeURIComponent(id) }`, { method: 'DELETE' })
}
