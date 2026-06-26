import { uuidv7 } from 'uuidv7'
import { member, organization, user } from '@ormod/database'
import type { DbClient } from '@ormod/database'
import type { Auth } from './createAuth.js'

export const SEEDED_OWNER_EMAIL = 'admin@ormod.local'

export const seedOwner = async (
  auth: Auth,
  db: DbClient,
  password: string
): Promise<boolean> => {
  const existing = await db.select({ id: user.id }).from(user).limit(1)
  if (existing.length > 0) {
    return false
  }

  const ctx = await auth.$context
  const created = await ctx.internalAdapter.createUser({
    email: SEEDED_OWNER_EMAIL,
    name: 'Owner',
    emailVerified: true,
    mustChangePassword: true,
  } as Parameters<typeof ctx.internalAdapter.createUser>[0])
  const hashed = await ctx.password.hash(password)
  await ctx.internalAdapter.linkAccount({
    accountId: created.id,
    providerId: 'credential',
    password: hashed,
    userId: created.id,
  })

  const organizationId = uuidv7()
  await db.insert(organization).values({
    id: organizationId,
    name: 'Ormod',
    slug: 'ormod',
    status: 'active',
    createdAt: new Date(),
  })
  await db.insert(member).values({
    id: uuidv7(),
    organizationId,
    userId: created.id,
    role: 'owner',
    createdAt: new Date(),
  })

  return true
}
