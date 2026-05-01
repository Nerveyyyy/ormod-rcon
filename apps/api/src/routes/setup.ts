import type { FastifyPluginAsync } from 'fastify'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { setupRequestSchema } from '@ormod/contracts'

interface SetupAuthApi {
  signUpEmail: (opts: {
    body: { email: string; password: string; name: string }
    asResponse?: true
  }) => Promise<Response>
  createOrganization: (opts: {
    body: { name: string; slug: string; userId: string }
  }) => Promise<unknown>
}

const slugify = (input: string): string => {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
  return base.length > 0 ? base : 'community'
}

const setupRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<TypeBoxTypeProvider>()
  const authApi = app.auth.api as unknown as SetupAuthApi

  r.post(
    '/api/setup',
    {
      schema: {
        tags: [ 'setup' ],
        body: setupRequestSchema,
      },
    },
    async (request, reply) => {
      // Self-locking: once any organization exists this endpoint
      // 404s, matching the standard "no such route" response so a
      // scanner can't tell the difference. The session response
      // omits `setupRequired` from then on, so the SPA never
      // navigates here either.
      const required = await app.setupStatus.isRequired(app.db)
      if (!required) return reply.notFound()

      const { email, password, name, orgName } = request.body

      let signUpResponse: Response
      try {
        signUpResponse = await authApi.signUpEmail({
          body: { email, password, name },
          asResponse: true,
        })
      } catch (err) {
        request.log.error({ err }, '[setup] signUpEmail threw')
        return reply.internalServerError('failed to create user')
      }

      if (!signUpResponse.ok) {
        const text = await signUpResponse.text().catch(() => { return '' })
        request.log.warn(
          { status: signUpResponse.status, text },
          '[setup] signUpEmail rejected',
        )
        return reply.badRequest('failed to create user')
      }

      let userId: string | null = null
      try {
        const parsed = await signUpResponse.clone().json() as
          { user?: { id?: string } } | null
        userId = parsed?.user?.id ?? null
      } catch (err) {
        request.log.error({ err }, '[setup] failed to parse signUp response')
      }

      if (!userId) {
        return reply.internalServerError('user id missing from signup response')
      }

      const slug = slugify(orgName)
      try {
        await authApi.createOrganization({
          body: { name: orgName, slug, userId },
        })
      } catch (err) {
        request.log.error({ err }, '[setup] createOrganization failed')
        // Orphan-user recovery is left to a re-run of /api/setup once
        // the caller notices the error; the route stays idempotent as
        // long as no organization row made it to the DB.
        return reply.internalServerError('failed to create organization')
      }

      // Flip the cache so the next /get-session call drops the
      // setupRequired field without doing another count query.
      app.setupStatus.markCompleted()

      return reply.code(204).send()
    },
  )
}

export default setupRoutes
