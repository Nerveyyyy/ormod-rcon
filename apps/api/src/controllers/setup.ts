import type { FastifyRequest, FastifyReply } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import prisma from '../db/prisma-client.js'
import { auth } from '../lib/auth.js'

export async function checkSetup() {
  const count = await prisma.user.count()
  return { setupRequired: count === 0 }
}

export async function getBootstrapSession(req: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })

  if (session?.user) {
    const user = session.user as { id: string; name: string; email: string; role?: string }
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ?? 'VIEWER',
      },
    }
  }

  const count = await prisma.user.count()
  if (count === 0) {
    return { setupRequired: true }
  }

  return reply.status(401).send({ error: 'Unauthorized' })
}

export async function createOwner(
  req: FastifyRequest<{ Body: { name: string; email: string; password: string } }>,
  reply: FastifyReply
) {
  const count = await prisma.user.count()
  if (count > 0) {
    return reply.status(403).send({ error: 'Setup already complete. Log in instead.' })
  }

  // name, email, password are validated by the route schema (required + minLength)
  const { name, email, password } = req.body

  const result = await auth.api.signUpEmail({
    body: { name, email, password },
    headers: fromNodeHeaders(req.headers),
  })

  if (!result?.user?.id) {
    return reply.status(500).send({ error: 'Failed to create user' })
  }

  // SQLite-safe compare-and-check: re-count users after sign-up to guard against
  // a race window where two concurrent setup requests both pass the initial count === 0
  // check. SQLite has no SELECT FOR UPDATE, so we re-verify after the insert.
  const countAfter = await prisma.user.count()
  if (countAfter > 1) {
    // Another user was created concurrently — delete this one and reject
    await prisma.user.delete({ where: { id: result.user.id } })
    return reply.status(403).send({ error: 'Setup already complete. Log in instead.' })
  }

  // Elevate to OWNER — BetterAuth creates users with the configured default role
  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: 'OWNER' },
  })

  return { ok: true, message: 'Owner account created. You can now log in.' }
}
