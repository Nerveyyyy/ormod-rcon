/**
 * Scheduled tasks — recurring operator actions plus per-fire history.
 *
 * Cron is evaluated in UTC, validated app-side. Scope mirrors bans:
 * `tenant_wide = true` ignores the junction; otherwise the junction
 * lists target servers.
 *
 * Two independent switches: `enabled` (durable operator intent) and
 * `paused_at` (transient suspension with a reason). Scheduler fires
 * only when enabled = true AND paused_at IS NULL. Pause is also the
 * channel for system-initiated halts (e.g. orphaned non-tenant-wide
 * tasks when their last target server is deleted).
 *
 * Next fire derives from `cron_expression` + `last_ran_at` at read
 * time — no `next_fires_at` column.
 *
 * Executions are fire-and-forget: a row exists only when the RCON
 * dispatch returned. Tenant-wide tasks expand to one execution row
 * per server at fire time.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'

export const scheduledTasks = pgTable(
  'scheduled_tasks',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),

    name: text('name').notNull(),

    // 'wipe' | 'command' | 'announcement'
    //   wipe         { wipe_type: 'map' | 'playerdata' | 'full' }
    //   command      { command: string }
    //   announcement { message: string }
    taskType: text('task_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),

    cronExpression: text('cron_expression').notNull(),

    tenantWide: boolean('tenant_wide').notNull().default(false),

    enabled: boolean('enabled').notNull().default(true),

    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pausedReason: text('paused_reason'),
    pausedByUserId: text('paused_by_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),

    // Most recent successful dispatch.
    lastRanAt: timestamp('last_ran_at', { withTimezone: true }),

    createdByUserId: text('created_by_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),

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
      index('scheduled_tasks_tenant_idx').on(table.tenantId),
      // Scheduler walk: runnable tasks only.
      index('scheduled_tasks_runnable_idx')
        .on(table.tenantId)
        .where(sql`${ table.enabled } = true
          AND ${ table.pausedAt } IS NULL`),
    ]
  },
)

export const scheduledTaskServers = pgTable(
  'scheduled_task_servers',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => { return scheduledTasks.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),
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
      primaryKey({
        name: 'scheduled_task_servers_pkey',
        columns: [ table.taskId, table.serverId ],
      }),
      index('scheduled_task_servers_tenant_server_idx').on(
        table.tenantId,
        table.serverId,
      ),
    ]
  },
)

export const scheduledTaskExecutions = pgTable(
  'scheduled_task_executions',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => { return scheduledTasks.id }, { onDelete: 'cascade' }),
    // Tenant-wide tasks resolve to one server per dispatch at fire time.
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),

    ranAt: timestamp('ran_at', { withTimezone: true }).notNull(),

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
      index('scheduled_task_executions_tenant_task_ran_idx').on(
        table.tenantId,
        table.taskId,
        table.ranAt.desc(),
      ),
      index('scheduled_task_executions_tenant_server_ran_idx').on(
        table.tenantId,
        table.serverId,
        table.ranAt.desc(),
      ),
    ]
  },
)
