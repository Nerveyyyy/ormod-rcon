/**
 * Server wipes — recurring schedules and run history from
 * `wipe.start` / `wipe.complete` RCON events.
 *
 * One row per (start → complete) pair. The row opens on start and
 * updates in place on complete. `error_reason` drives the three-state
 * badge: NULL completed_at = in progress; set + null error = completed;
 * set + set error = failed.
 *
 * Sources: 'manual' (dashboard, author_user_id set), 'scheduled'
 * (scheduler, wipe_schedule_id set), 'ingame' (in-game admin, no
 * attribution).
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'

export const wipeSchedules = pgTable(
  'wipe_schedules',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),

    enabled: boolean('enabled').notNull().default(false),
    // 5-field cron, evaluated in UTC, validated app-side.
    cronExpression: text('cron_expression').notNull(),
    // 'map' | 'playerdata' | 'full'
    wipeType: text('wipe_type').notNull(),

    kickBeforeWipe: boolean('kick_before_wipe').notNull().default(true),
    forceSaveBeforeWipe: boolean('force_save_before_wipe')
      .notNull()
      .default(true),

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
      index('wipe_schedules_tenant_server_idx').on(
        table.tenantId,
        table.serverId,
      ),
    ]
  },
)

export const wipeRuns = pgTable(
  'wipe_runs',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),
    // SET NULL so historical runs survive schedule deletion.
    wipeScheduleId: uuid('wipe_schedule_id').references(
      () => { return wipeSchedules.id },
      { onDelete: 'set null' },
    ),

    // 'map' | 'playerdata' | 'full'
    type: text('type').notNull(),
    // 'manual' | 'scheduled' | 'ingame'
    source: text('source').notNull(),

    authorUserId: text('author_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),
    // Set only when type='playerdata' and scoped to a single player.
    targetSteamId: text('target_steam_id'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // Verbatim from wipe.complete.wipedAt — canonical "last wiped at".
    wipedAt: timestamp('wiped_at', { withTimezone: true }),
    errorReason: text('error_reason'),

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
      index('wipe_runs_tenant_server_started_idx').on(
        table.tenantId,
        table.serverId,
        table.startedAt.desc(),
      ),
      // At most one open wipe per server.
      uniqueIndex('wipe_runs_open_wipe_unique')
        .on(table.serverId)
        .where(sql`${ table.completedAt } IS NULL`),
    ]
  },
)
