import env from '@fastify/env'
import { type Static, Type } from '@fastify/type-provider-typebox'

const schema = Type.Object({
  HOST: Type.String({ default: '0.0.0.0' }),
  PORT: Type.Number({ default: 3000 }),
  LOG_LEVEL: Type.String({ default: 'info' }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  BETTER_AUTH_SECRET: Type.String({ minLength: 16 }),
  PUBLIC_URL: Type.String({ default: 'http://localhost:3000' }),
  CORS_ORIGIN: Type.String({ default: 'http://localhost:8080' }),
  SERVE_WEB_DIR: Type.Optional(Type.String()),
  RATE_LIMIT_MAX: Type.Number({ default: 100 }),
})

export type Config = Static<typeof schema>

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
  }
}

export const autoConfig = () => {
  return {
    confKey: 'config',
    schema,
    dotenv: false,
    data: process.env,
  }
}

export default env
