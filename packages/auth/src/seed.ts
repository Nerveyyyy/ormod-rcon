import { and, eq } from 'drizzle-orm'
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
  const ctx = await auth.$context

  let isNew = false
  let [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, SEEDED_OWNER_EMAIL))
    .limit(1)
  if (!owner) {
    const created = await ctx.internalAdapter.createUser({
      email: SEEDED_OWNER_EMAIL,
      name: 'Owner',
      emailVerified: true,
    })
    owner = { id: created.id }
    isNew = true
  }

  const accounts = await ctx.internalAdapter.findAccounts(owner.id)
  if (!accounts.some((a) => a.providerId === 'credential')) {
    const hashed = await ctx.password.hash(password)
    await ctx.internalAdapter.linkAccount({
      accountId: owner.id,
      providerId: 'credential',
      password: hashed,
      userId: owner.id,
      // mustChangePassword is a better-auth additionalField, not in the
      // adapter's input type
      mustChangePassword: true,
    } as Parameters<typeof ctx.internalAdapter.linkAccount>[0])
  }

  let [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, 'ormod'))
    .limit(1)
  if (!org) {
    const organizationId = uuidv7()
    await db.insert(organization).values({
      id: organizationId,
      name: 'Ormod',
      slug: 'ormod',
      status: 'active',
      createdAt: new Date(),
    })
    org = { id: organizationId }
  }

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, org.id), eq(member.userId, owner.id)))
    .limit(1)
  if (!membership) {
    await db.insert(member).values({
      id: uuidv7(),
      organizationId: org.id,
      userId: owner.id,
      role: 'owner',
      createdAt: new Date(),
    })
  }

  return isNew
}
