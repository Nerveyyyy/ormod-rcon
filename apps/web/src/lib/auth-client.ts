/**
 * auth-client.ts — BetterAuth browser client
 *
 * Provides typed wrappers around the BetterAuth API endpoints.
 * The baseURL is omitted here — all requests go to the same origin
 * (relative paths), which works for both Vite dev proxy and Docker prod.
 */

import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  // Empty string = same origin (Vite proxies /api/auth → port 3001 in dev)
  baseURL: '',
});

export type { Session } from 'better-auth';
