import { Type, type Static } from '@sinclair/typebox'

/**
 * Single shape every error response uses. `code` is a short
 * machine-readable string (`not_found`, `validation_failed`, …);
 * `message` is the human-readable line. `details` only appears for
 * validation errors and lists the offending fields.
 */
export const errorDetailSchema = Type.Object({
  field: Type.String(),
  issue: Type.String(),
})

export type ErrorDetail = Static<typeof errorDetailSchema>

export const errorEnvelopeSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.Array(errorDetailSchema)),
  }),
})

export type ErrorEnvelope = Static<typeof errorEnvelopeSchema>
