import type { AppConfig } from './config.js'

export interface ResolvedOrigins {
  /** Allowed CORS origins + Better Auth trusted origins. */
  allowed: string[]
  /** Base URL Better Auth uses for callbacks and redirects. */
  baseUrl: string
}

/**
 * Single source of truth for the URLs the API trusts. Production runs
 * behind PUBLIC_URL; local dev falls back to the Vite dashboard origin
 * and the API's own listening port so the cookie / CORS round-trip
 * works without extra wiring.
 */
export const resolveOrigins = (
  config: Pick<AppConfig, 'PUBLIC_URL' | 'PORT'>,
): ResolvedOrigins => {
  if (config.PUBLIC_URL) {
    return {
      allowed: [ config.PUBLIC_URL ],
      baseUrl: config.PUBLIC_URL,
    }
  }
  const apiOrigin = `http://localhost:${ config.PORT }`
  return {
    allowed: [ 'http://localhost:8080', apiOrigin ],
    baseUrl: apiOrigin,
  }
}
