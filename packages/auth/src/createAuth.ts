import { uuidv7 } from 'uuidv7'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { captcha, organization, twoFactor } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key'
import { redisStorage } from '@better-auth/redis-storage'
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth'
import type { DbClient } from '@ormod/database'
import type { Redis } from '@ormod/redis'

export type CaptchaOptions = Parameters<typeof captcha>[0]

export interface CreateAuthOptions {
  db: DbClient
  secret: string
  baseURL: string
  trustedOrigins: string[]
  redisClient: Redis
  ipAddressHeader?: string
  captcha?: CaptchaOptions
}

export const API_KEY_RATE_LIMIT = {
  enabled: true,
  timeWindow: 60_000,
  maxRequests: 600,
}

export const authBaseOptions = {
  appName: 'ormod-rcon',
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: !process.stdout.isTTY,
    storage: 'secondary-storage',
    window: 60,
    max: 100,
  },
  advanced: {
    cookiePrefix: 'ormod',
    useSecureCookies: !process.stdout.isTTY,
    database: {
      generateId: () => uuidv7(),
    },
  },
} satisfies Partial<BetterAuthOptions>

export const authPlugins = (
  captchaOptions?: CaptchaOptions
): BetterAuthPlugin[] => {
  return [
    organization({
      allowUserToCreateOrganization: false,
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
    apiKey({
      references: 'organization',
      storage: 'secondary-storage',
      fallbackToDatabase: true,
      rateLimit: API_KEY_RATE_LIMIT,
    }),
    twoFactor(),
    ...(captchaOptions ? [captcha(captchaOptions)] : []),
  ]
}

export const createAuth = (opts: CreateAuthOptions) => {
  return betterAuth({
    ...authBaseOptions,
    database: drizzleAdapter(opts.db, { provider: 'pg' }),
    secret: opts.secret,
    baseURL: opts.baseURL,
    trustedOrigins: opts.trustedOrigins,
    secondaryStorage: redisStorage({
      client: opts.redisClient,
      keyPrefix: 'better-auth:',
    }),
    advanced: {
      ...authBaseOptions.advanced,
      ...(opts.ipAddressHeader
        ? { ipAddress: { ipAddressHeaders: [opts.ipAddressHeader] } }
        : {}),
    },
    plugins: authPlugins(opts.captcha),
  })
}

export type Auth = ReturnType<typeof createAuth>

const authConfig = () => {
  return createAuth({
    db: {} as never,
    secret: 'cli-generate-only',
    baseURL: 'http://localhost',
    trustedOrigins: [],
    redisClient: {} as never,
  })
}

export default authConfig
