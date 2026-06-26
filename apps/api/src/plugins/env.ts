import env from '@fastify/env'
import { type Static, Type } from '@fastify/type-provider-typebox'

const schema = Type.Object({
  HOST: Type.String({ default: '0.0.0.0' }),
  PORT: Type.Number({ default: 3000 }),
  LOG_LEVEL: Type.String({ default: 'info' }),
  PUBLIC_URL: Type.String({ default: 'http://localhost:3000' }),
  WEB_ORIGIN: Type.Optional(Type.String()),
  TRUSTED_IP_HEADER: Type.Optional(Type.String()),
  DATABASE_URL: Type.String({ minLength: 1 }),
  REDIS_URL: Type.String({ minLength: 1 }),
  BETTER_AUTH_SECRET: Type.String({ minLength: 32 }),
  ORMOD_SECRET_KEY: Type.String({ minLength: 1 }),
  OWNER_PASSWORD: Type.String({ default: 'changeme', minLength: 8 }),
  CAPTCHA_PROVIDER: Type.Optional(
    Type.Union([
      Type.Literal('cloudflare-turnstile'),
      Type.Literal('google-recaptcha'),
      Type.Literal('hcaptcha'),
      Type.Literal('captchafox'),
    ])
  ),
  CAPTCHA_SECRET_KEY: Type.Optional(Type.String()),
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
