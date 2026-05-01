import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [ organizationClient() ],
})

/**
 * The API's `/get-session` after-hook adds a top-level `setupRequired`
 * field while no organization exists. Once setup is complete the field
 * is omitted from the response, so its presence — not its value — is
 * the signal to render `/setup`.
 */
export interface SessionData {
  setupRequired?: boolean
}

export const isSetupRequired = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') return false
  return (data as SessionData).setupRequired === true
}
