import type { FastifyRequest, FastifyReply } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import prisma from '../db/prisma-client.js';
import { auth } from '../lib/auth.js';

type CreateUserBody = {
  name: string;
  email: string;
  password: string;
  role: string;
};

type UpdateRoleBody = {
  role: 'OWNER' | 'ADMIN' | 'VIEWER';
};

type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

export async function createUser(
  req: FastifyRequest<{ Body: CreateUserBody }>,
  reply: FastifyReply,
) {
  const { name, email, password, role } = req.body;

  // Reject OWNER creation — only the setup flow can create OWNERs
  if (role === 'OWNER') {
    return reply.status(400).send({ error: 'Cannot create users with OWNER role' });
  }

  // Check duplicate email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return reply.status(409).send({ error: 'A user with this email already exists' });
  }

  // Create via BetterAuth for proper password hashing
  const result = await auth.api.signUpEmail({
    body:    { name, email, password },
    headers: fromNodeHeaders(req.headers),
  });

  if (!result?.user?.id) {
    return reply.status(500).send({ error: 'Failed to create user' });
  }

  // Set role (BetterAuth defaults to VIEWER)
  const user = await prisma.user.update({
    where:  { id: result.user.id },
    data:   { role },
    select: USER_SELECT,
  });

  reply.status(201);
  return user;
}

export async function updateRole(
  req: FastifyRequest<{ Params: { id: string }; Body: UpdateRoleBody }>,
  reply: FastifyReply,
) {
  const { id } = req.params;
  const { role } = req.body;

  // Prevent self-role-change
  if (req.session!.user.id === id) {
    return reply.status(400).send({ error: 'Cannot change your own role' });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return reply.status(404).send({ error: 'User not found' });
  }

  // Prevent demoting the last OWNER
  if (target.role === 'OWNER' && role !== 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } });
    if (ownerCount <= 1) {
      return reply.status(400).send({ error: 'Cannot demote the last OWNER' });
    }
  }

  const updated = await prisma.user.update({
    where:  { id },
    data:   { role },
    select: USER_SELECT,
  });

  return updated;
}

export async function deleteUser(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id } = req.params;

  // Prevent self-delete
  if (req.session!.user.id === id) {
    return reply.status(400).send({ error: 'Cannot delete your own account' });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return reply.status(404).send({ error: 'User not found' });
  }

  // Prevent deleting the last OWNER
  if (target.role === 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } });
    if (ownerCount <= 1) {
      return reply.status(400).send({ error: 'Cannot delete the last OWNER' });
    }
  }

  // Cascade: delete sessions and accounts first, then user
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.account.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  return { ok: true };
}

export async function getMe(req: FastifyRequest) {
  const { id, name, email, role } = req.session!.user;
  return { id, name, email, role };
}

export async function changeOwnPassword(
  req: FastifyRequest<{ Body: ChangePasswordBody }>,
  reply: FastifyReply,
) {
  const { currentPassword, newPassword } = req.body;

  if (newPassword.length < 8) {
    return reply.status(400).send({ error: 'New password must be at least 8 characters' });
  }

  try {
    await auth.api.changePassword({
      body:    { currentPassword, newPassword },
      headers: fromNodeHeaders(req.headers),
    });
    return { ok: true };
  } catch (err: any) {
    const message = err?.message || 'Password change failed';
    // BetterAuth throws on wrong current password
    return reply.status(400).send({ error: message });
  }
}
