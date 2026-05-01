/**
 * Append-only ledger of admin actions. Distinct from `game_events`
 * (gameplay telemetry) and from state tables like `bans` (current
 * truth) — this answers "who did what, when".
 *
 * Actor and target labels are snapshotted at insert time so the log
 * renders correctly after the subject is removed. Rolling retention
 * (default 90d) is enforced by a nightly prune.
 */

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'

export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    // NULL for tenant-wide actions.
    serverId: uuid('server_id').references(
      () => { return servers.id },
      { onDelete: 'set null' },
    ),

    // 'user' | 'system' | 'extension' | 'support'
    actorType: text('actor_type').notNull(),
    actorUserId: text('actor_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),
    // Snapshot — survives user deletion, anonymised on GDPR erasure.
    actorLabel: text('actor_label').notNull(),

    // Dot-namespaced ('ban.created', 'wipe.started', ...).
    action: text('action').notNull(),
    // 'player' | 'server' | 'setting' | 'ban' | 'schedule' | 'member'
    targetType: text('target_type').notNull(),
    // Opaque id within target_type.
    targetRef: text('target_ref').notNull(),
    // Snapshot — same survives-delete reasoning as actor_label.
    targetLabel: text('target_label').notNull(),

    // Action-specific payload — { key, from, to } / { reason, duration } / etc.
    details: jsonb('details').$type<Record<string, unknown>>(),

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
      index('activity_log_tenant_created_idx').on(
        table.tenantId,
        table.createdAt.desc(),
      ),
      index('activity_log_tenant_server_created_idx').on(
        table.tenantId,
        table.serverId,
        table.createdAt.desc(),
      ),
      index('activity_log_tenant_actor_created_idx').on(
        table.tenantId,
        table.actorUserId,
        table.createdAt.desc(),
      ),
    ]
  },
)
