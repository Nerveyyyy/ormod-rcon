import type { FastifyRequest, FastifyReply } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import prisma from '../db/prisma-client.js';
import { auth } from '../lib/auth.js';

export async function checkSetup() {
  const count = await prisma.user.count();
  return { setupRequired: count === 0 };
}

export async function createOwner(
  req: FastifyRequest<{ Body: { name: string; email: string; password: string } }>,
  reply: FastifyReply,
) {
  const count = await prisma.user.count();
  if (count > 0) {
    return reply.status(403).send({ error: 'Setup already complete. Log in instead.' });
  }

  // name, email, password are validated by the route schema (required + minLength)
  const { name, email, password } = req.body;

  const result = await auth.api.signUpEmail({
    body:    { name, email, password },
    headers: fromNodeHeaders(req.headers),
  });

  if (!result?.user?.id) {
    return reply.status(500).send({ error: 'Failed to create user' });
  }

  // Elevate to OWNER — BetterAuth creates users with the configured default role
  await prisma.user.update({
    where: { id: result.user.id },
    data:  { role: 'OWNER' },
  });

  return { ok: true, message: 'Owner account created. You can now log in.' };
}
