import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { apiBase } from './api'

// empty apiBase -> same origin (dev proxy / bundled); a set VITE_API_URL -> split deploy
export const authClient = createAuthClient({
  baseURL: apiBase || undefined,
  plugins: [twoFactorClient()],
})
