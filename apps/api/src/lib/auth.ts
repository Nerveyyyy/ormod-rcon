/**
 * auth.ts — BetterAuth configuration
 *
 * Self-hosted email+password auth backed by Prisma/SQLite.
 * No external services or paid tiers required.
 *
 * Session cookie is HTTP-only, SameSite=Lax, Secure in production.
 * RBAC roles (OWNER | ADMIN | VIEWER) are stored on the User model.
 */

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import prisma from '../db/prisma-client.js'
import { computeOrigins } from '../config.js'

const publicUrl = process.env.PUBLIC_URL ?? ''
const apiHost = process.env.API_HOST ?? 'localhost'
const apiPort = process.env.API_PORT ?? '3001'
const webHost = process.env.WEB_HOST ?? 'localhost'
const webPort = process.env.WEB_PORT ?? '3000'

const BASE_URL = publicUrl || `http://${apiHost}:${apiPort}`
const TRUSTED_ORIGINS = computeOrigins(publicUrl, webHost, webPort)

export const auth = betterAuth({
  baseURL: BASE_URL,
  database: prismaAdapter(prisma, { provider: 'sqlite' }),

  // Email + password is the only auth method for self-hosted installs.
  // OAuth / magic-links can be added via BetterAuth plugins in future.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // no email server required for self-hosted
    minPasswordLength: 8,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh cookie every 24h of activity
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5-minute client-side cache
    },
  },

  // Allow the dashboard UI origin to send credentials
  trustedOrigins: TRUSTED_ORIGINS,

  // Expose the `role` field so it's included in session.user
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'VIEWER',
        input: false, // clients cannot set this directly — API only
      },
    },
  },
})

export type Auth = typeof auth

// ── Role helpers ──────────────────────────────────────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'VIEWER'

export function canWrite(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export function isOwner(role: string): boolean {
  return role === 'OWNER'
}
