import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization, twoFactor } from 'better-auth/plugins'
import type { DbClient } from '@ormod/database'
import type { AppConfig } from './config.js'
import { resolveOrigins } from './origins.js'
import type { SetupStatusTracker } from './setup-status.js'

export interface CreateAuthDeps {
  db: DbClient
  config: Pick<AppConfig, 'BETTER_AUTH_SECRET' | 'PUBLIC_URL' | 'HOST' | 'PORT'>
  setupStatus: SetupStatusTracker
}

/**
 * Narrow view of the Better Auth instance we actually call into. Keeping
 * this explicit isolates the app from Better Auth's deeply-inferred types
 * (which drag in zod-internal paths that change between minor versions)
 * and makes the auth seam swap-in-friendly — any adapter exposing these
 * two members satisfies the request-context and handler plugins.
 */
export interface AuthSessionUser {
  id: string
  email: string
  name: string
}

export interface AuthSessionRecord {
  id: string
  activeOrganizationId?: string | null
}

export interface AuthSession {
  user: AuthSessionUser
  session: AuthSessionRecord
}

export interface Auth {
  handler: (req: Request) => Promise<Response>
  api: {
    getSession: (opts: { headers: Headers }) => Promise<AuthSession | null>
  }
}

export const createAuth = ({ db, config, setupStatus }: CreateAuthDeps): Auth => {
  const { allowed, baseUrl } = resolveOrigins(config)

  const auth = betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: baseUrl,
    database: drizzleAdapter(db, { provider: 'pg' }),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      organization({
        schema: {
          organization: {
            additionalFields: {
              status: {
                type: 'string',
                required: false,
                defaultValue: 'active',
              },
            },
          },
        },
      }),
      twoFactor(),
    ],
    trustedOrigins: allowed,
    hooks: {
      // Augment /get-session with `setupRequired: true` while no org
      // exists. Once setup is complete the field is omitted entirely —
      // the response shape is the unmodified Better Auth payload.
      // Note: `auth.api.getSession()` runs through this hook too, so
      // the `{setupRequired: true}` wrapper can come back from a
      // server-side call even when there is no real session — server
      // consumers must check for `user` before trusting the response.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/get-session') return
        const required = await setupStatus.isRequired(db)
        if (!required) return
        const returned = ctx.context.returned as Record<string, unknown> | null | undefined
        const base = returned && typeof returned === 'object' ? returned : {}
        return ctx.json({ ...base, setupRequired: true })
      }),
    },
  })

  return auth as unknown as Auth
}
