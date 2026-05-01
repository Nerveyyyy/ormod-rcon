/**
 * Per-server role overlay on top of BetterAuth's `member` role.
 *
 * The common case (one role across the whole org) uses `member.role`
 * and this table stays empty. Use this for "MOD on A, VIEWER on B,
 * none on C". OWNER is excluded — owners are always org-wide.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'

export const serverPermissions = pgTable(
  'server_permissions',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => { return user.id }, { onDelete: 'cascade' }),
    // 'ADMIN' | 'MOD' | 'VIEWER' — validated app-side.
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => { return new Date() }),
  },
  (table) => {
    return [
      unique('server_permissions_server_user_unique').on(
        table.serverId,
        table.userId,
      ),
    ]
  },
)
