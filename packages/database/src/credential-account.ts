import { and, eq } from 'drizzle-orm'
import { account } from './schema/auth.js'
import type { DbClient } from './client.js'

export const mustChangePasswordFor = async (
  db: DbClient,
  userId: string
): Promise<boolean> => {
  const [row] = await db
    .select({ mustChangePassword: account.mustChangePassword })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, 'credential'))
    )
    .limit(1)
  return row?.mustChangePassword ?? false
}
