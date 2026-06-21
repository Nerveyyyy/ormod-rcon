export function loggerOptions(
  logLevel = process.env.LOG_LEVEL ?? 'info'
): Record<string, unknown> {
  const base = {
    level: logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
      ],
      censor: '[redacted]',
    },
  }

  if (!process.stdout.isTTY) return base

  return {
    ...base,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }
}

export function requestLogLevel(statusCode: number): 'info' | 'warn' | 'error' {
  if (statusCode >= 500) return 'error'
  if (statusCode >= 400) return 'warn'
  return 'info'
}
