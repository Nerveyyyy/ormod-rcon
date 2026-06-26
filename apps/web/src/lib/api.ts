const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

// empty base = relative /api, which works bundled and through the dev proxy
export const apiBase = base

export const apiUrl = (path: string): string => {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
