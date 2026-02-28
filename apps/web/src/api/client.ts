const BASE = '/api'

// ── CSRF token cache ────────────────────────────────────────────────────────

let csrfToken: string | null = null

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  const res = await fetch(`${BASE}/csrf-token`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to fetch CSRF token: ${res.status}`)
  const data = (await res.json()) as { token: string }
  csrfToken = data.token
  return csrfToken
}

/** Clear the cached token so the next mutating request fetches a fresh one. */
export function clearCsrfToken() {
  csrfToken = null
}

// ── Request helper ──────────────────────────────────────────────────────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'

  // Include CSRF token on state-changing requests
  if (!SAFE_METHODS.has(method)) {
    headers['x-csrf-token'] = await ensureCsrfToken()
  }

  let res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })

  // If CSRF validation failed (token expired/rotated), refresh and retry once
  if (res.status === 403 && !SAFE_METHODS.has(method)) {
    csrfToken = null
    headers['x-csrf-token'] = await ensureCsrfToken()
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    })
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Public API ──────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
