import { readFileSync } from 'node:fs'

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string }

export type NodeEnv = 'development' | 'production' | 'test'

export interface Config {
  nodeEnv: NodeEnv
  host: string
  port: number
  logLevel: string
  corsOrigin: string
  version: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.PORT ?? '3000', 10)
  if (Number.isNaN(port)) {
    throw new Error(`PORT must be a number, got '${env.PORT}'`)
  }

  return {
    nodeEnv: (env.NODE_ENV ?? 'development') as NodeEnv,
    host: env.HOST ?? '0.0.0.0',
    port,
    logLevel: env.LOG_LEVEL ?? 'info',
    corsOrigin: env.CORS_ORIGIN ?? '*',
    version: pkg.version,
  }
}
