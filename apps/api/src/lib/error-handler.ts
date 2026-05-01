import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import type { AppConfig } from './config.js'
import { PaginationError } from './pagination.js'

export interface ErrorHandlerDeps {
  config: Pick<AppConfig, 'NODE_ENV'>
}

interface ErrorDetail {
  field: string
  issue: string
}

interface ErrorPayload {
  error: {
    code: string
    message: string
    details?: ErrorDetail[]
    stack?: string
  }
}

const codeFromStatus = (status: number): string => {
  if (status === 400) return 'bad_request'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'unprocessable_entity'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'internal_error'
  return 'error'
}

interface AjvErrorShape {
  instancePath?: string
  message?: string
  keyword?: string
  params?: Record<string, unknown>
}

/**
 * Pull field-level details out of a Fastify/Ajv validation failure.
 * Fastify attaches the Ajv error array to `err.validation` when schema
 * validation rejects a request; we translate it into the public
 * `{ field, issue }` shape so the UI can highlight the right input.
 * Returns `undefined` when the error isn't validation-shaped.
 */
const extractValidationDetails = (err: unknown): ErrorDetail[] | undefined => {
  if (!err || typeof err !== 'object') return undefined
  const validation = (err as { validation?: unknown }).validation
  if (!Array.isArray(validation) || validation.length === 0) return undefined
  return validation.map((raw) => {
    const i = raw as AjvErrorShape
    // `instancePath` is a JSON Pointer like "/handle" or "/nested/0/x".
    // For missing required props the offending field is in `params.missingProperty`,
    // not in instancePath, so fold that in too.
    const base = (i.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.')
    const missing = typeof i.params?.missingProperty === 'string'
      ? i.params.missingProperty
      : null
    const field = missing
      ? (base ? `${ base }.${ missing }` : missing)
      : (base || '(root)')
    return { field, issue: i.message ?? 'invalid' }
  })
}

/**
 * Single Fastify error handler. Status drives both the log level and
 * the JSON envelope; auth-shaped 4xx (401/403/404) stay quiet so log
 * volume tracks real problems, not crawler noise. Validation errors
 * also surface a `details` array pointing at the offending fields.
 * Unknown errors land as 500 with a generic message — the original
 * error is logged but never serialised to the response body in
 * production.
 */
export const buildErrorHandler = (deps: ErrorHandlerDeps) => {
  const isDev = deps.config.NODE_ENV !== 'production'

  return async (
    err: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    let status = typeof err.statusCode === 'number' ? err.statusCode : 500
    let code = codeFromStatus(status)
    let message = err.message || 'Internal Server Error'

    // Pagination errors throw with a stable code; surface it directly
    // instead of the generic status-derived label.
    if (err instanceof PaginationError) {
      status = 400
      code = err.code
    }

    const details = extractValidationDetails(err)
    if (details) {
      status = status >= 400 ? status : 400
      code = 'validation_failed'
      message = 'Request failed validation.'
    }

    if (status >= 500) {
      request.log.error({ err, path: request.url }, '[error] unhandled')
    } else if (status === 401 || status === 403 || status === 404) {
      // silent — these are routine and would otherwise drown the logs.
    } else if (status >= 400) {
      request.log.warn({ err, path: request.url }, `[error] ${ code }`)
    }

    const payload: ErrorPayload = {
      error: {
        code,
        message: status >= 500 && !isDev ? 'Internal Server Error' : message,
      },
    }
    if (details) payload.error.details = details
    // Stack traces are signal for unexpected crashes (5xx) — for known
    // 4xx outcomes they're just noise that leaks file paths to the
    // caller. Even in dev, only attach the stack when the status code
    // says something genuinely went wrong server-side.
    if (isDev && err.stack && status >= 500) payload.error.stack = err.stack

    await reply.status(status).send(payload)
  }
}
