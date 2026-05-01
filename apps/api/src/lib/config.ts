import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

const configSchema = Type.Object({
  NODE_ENV: Type.Union(
    [ Type.Literal('development'), Type.Literal('test'), Type.Literal('production') ],
    { default: 'development' },
  ),
  PORT: Type.Integer({ minimum: 1, default: 3000 }),
  // Defaults to loopback so dev doesn't accidentally expose the API on
  // the LAN. Docker / production deployments explicitly set HOST=0.0.0.0
  // via env to bind every interface.
  HOST: Type.String({ default: '127.0.0.1' }),
  LOG_LEVEL: Type.Union(
    [
      Type.Literal('trace'),
      Type.Literal('debug'),
      Type.Literal('info'),
      Type.Literal('warn'),
      Type.Literal('error'),
      Type.Literal('fatal'),
    ],
    { default: 'info' },
  ),
  DATABASE_URL: Type.String({ minLength: 1 }),
  ORMOD_SECRET_KEY: Type.String({ minLength: 1 }),
  BETTER_AUTH_SECRET: Type.String({ minLength: 16 }),
  PUBLIC_URL: Type.Optional(Type.String({ minLength: 1 })),
  // Optional directory holding the built dashboard (apps/web/dist). When
  // set, the API serves those static assets so a single container can
  // host both the JSON API and the SPA. Left unset in local dev, where
  // Vite serves the dashboard on :5173 and proxies /api to :3000.
  SERVE_WEB_DIR: Type.Optional(Type.String()),
})

export type AppConfig = Static<typeof configSchema>

const PLACEHOLDER_SECRET = 'change_this_to_something_very_random_and_long'

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  // Pipeline: fill defaults, coerce env strings to their declared
  // types, then collect every validation error into one message so the
  // operator sees all problems at once instead of fixing them one at a
  // time. Clone into a plain object first — process.env is backed by a
  // native store that stringifies every assigned value, so letting
  // TypeBox write defaults/conversions through it turns PORT=3000 back
  // into "3000" and fails integer validation.
  const input = { ...env } as Record<string, unknown>
  const defaulted = Value.Default(configSchema, input) as Record<string, unknown>
  const converted = Value.Convert(configSchema, defaulted) as Record<string, unknown>

  const errors = [ ...Value.Errors(configSchema, converted) ]
  if (errors.length > 0) {
    const lines = errors.map((e) => {
      const field = e.path.replace(/^\//, '').replace(/\//g, '.') || '(root)'
      return `  - ${ field }: ${ e.message }`
    })
    throw new Error(
      [
        'Configuration error — one or more required environment variables are missing or invalid:',
        ...lines,
        'Copy .env.example to .env and fill the required values.',
      ].join('\n'),
    )
  }

  const config = converted as AppConfig
  if (config.BETTER_AUTH_SECRET === PLACEHOLDER_SECRET) {
    throw new Error(
      'Configuration error — BETTER_AUTH_SECRET is still the placeholder value. Generate a strong random secret.',
    )
  }

  return config
}
