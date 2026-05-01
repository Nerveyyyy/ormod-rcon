import { Type, type Static } from '@sinclair/typebox'

/**
 * First-run bootstrap. Creates the operator account and the single
 * organization the deployment runs under. The route locks itself the
 * moment any organization exists, so the shape has no admin override.
 *
 * Successful POST returns 204 No Content — the side effect is its own
 * confirmation; no body is required.
 */
export const setupRequestSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 128 }),
  orgName: Type.String({ minLength: 1, maxLength: 128 }),
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8, maxLength: 256 }),
})

export type SetupRequest = Static<typeof setupRequestSchema>
