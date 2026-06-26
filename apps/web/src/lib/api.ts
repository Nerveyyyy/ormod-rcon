const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

// empty base = relative /api, which works bundled and through the dev proxy
export const apiBase = base

export const apiUrl = (path: string): string => {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface ErrorBody {
  message?: string
  code?: string
}

export const apiFetch = async <T>(
  path: string,
  init?: RequestInit
): Promise<T> => {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => {
      return {}
    })) as ErrorBody
    throw new ApiError(res.status, body.message ?? res.statusText, body.code)
  }

  return res.json() as Promise<T>
}
