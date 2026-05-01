import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'

const directoryExists = async (path: string): Promise<boolean> => {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

/**
 * Serves the built dashboard from `config.SERVE_WEB_DIR` when set.
 * Anything that doesn't match a registered route or a file on disk
 * falls through to `index.html` so client-side routes survive a hard
 * refresh. API paths (`/api/*`) and non-GETs always return JSON 404
 * instead. Disabled entirely when SERVE_WEB_DIR is unset (local dev
 * where Vite serves the dashboard on :5173).
 */
const spaFallbackPlugin: FastifyPluginAsync = async (app) => {
  const configured = app.config.SERVE_WEB_DIR
  if (!configured) return

  const dir = resolve(configured)
  if (!(await directoryExists(dir))) {
    app.log.warn({ dir }, '[spa-fallback] SERVE_WEB_DIR does not exist; skipping')
    return
  }

  let indexHtml: string | null = null
  try {
    indexHtml = await readFile(resolve(dir, 'index.html'), 'utf8')
  } catch (err) {
    app.log.warn(
      { err, dir },
      '[spa-fallback] SERVE_WEB_DIR has no index.html; SPA fallback disabled',
    )
  }

  await app.register(fastifyStatic, { root: dir, prefix: '/', wildcard: false })

  if (!indexHtml) return
  const html = indexHtml

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/api/')) {
      return reply
        .code(404)
        .send({ error: { code: 'not_found', message: 'Not Found' } })
    }
    return reply
      .code(200)
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(html)
  })
}

export default fp(spaFallbackPlugin, { name: 'spa-fallback' })
