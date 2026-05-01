import { Type, type Static } from '@sinclair/typebox'

export const healthzResponseSchema = Type.Object({
  status: Type.Literal('ok'),
  version: Type.String(),
  uptime: Type.Number({ minimum: 0 }),
})

export type HealthzResponse = Static<typeof healthzResponseSchema>

export const readyzOkSchema = Type.Object({
  status: Type.Literal('ok'),
})

export const readyzFailSchema = Type.Object({
  status: Type.Literal('degraded'),
  checks: Type.Object({
    database: Type.Union([ Type.Literal('ok'), Type.Literal('fail') ]),
  }),
})

export type ReadyzResponse =
  | Static<typeof readyzOkSchema>
  | Static<typeof readyzFailSchema>
