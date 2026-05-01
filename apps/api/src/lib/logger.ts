import { pino, type Logger } from 'pino'
import type { AppConfig } from './config.js'

export const createLogger = (config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>): Logger => {
  const pretty = config.NODE_ENV !== 'production'
  return pino({
    level: config.LOG_LEVEL,
    base: undefined,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.rcon_password',
        '*.rcon_password_encrypted',
      ],
      censor: '[redacted]',
    },
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          singleLine: false,
          ignore: 'pid,hostname,reqId,req,res',
        },
      },
    }),
  })
}

export type AppLogger = Logger

export type RequestLogLevel = 'silent' | 'info' | 'warn' | 'error'

/**
 * Status-aware level mapping for the per-request log line.
 * 2xx info · 3xx silent · 4xx warn · 5xx (or thrown error) error.
 */
export const requestLogLevel = (
  statusCode: number,
  hasError: boolean,
): RequestLogLevel => {
  if (hasError || statusCode >= 500) return 'error'
  if (statusCode >= 400) return 'warn'
  if (statusCode >= 300) return 'silent'
  return 'info'
}
