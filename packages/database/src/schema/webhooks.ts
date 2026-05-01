/**
 * Webhooks — operator-configured outbound HTTP endpoints with a thin
 * per-dispatch audit log.
 *
 * Endpoints are server-scoped. Two types: 'discord' (Discord embed
 * format) and 'http' (raw JSON POST). Both store URL encrypted —
 * Discord URLs contain the token. `secret_encrypted` is the HMAC
 * signing key for HTTP endpoints.
 *
 * Lifecycle mirrors scheduled_tasks: `enabled` (durable intent) and
 * `paused_at` (transient suspension, e.g. auto-pause on repeated
 * failure).
 *
 * Deliveries are a thin audit log — one row per dispatch attempt, no
 * retries, no FK back to the outbox (which is purged aggressively).
 * Only status and response code are captured per row.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    // 'discord' | 'http'
    type: text('type').notNull(),

    urlEncrypted: text('url_encrypted').notNull(),
    // HMAC signing key. NULL for Discord.
    secretEncrypted: text('secret_encrypted'),

    // Topic names ('player.join', 'death', 'ban.created', ...).
    subscribedEvents: text('subscribed_events')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    enabled: boolean('enabled').notNull().default(true),

    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pausedReason: text('paused_reason'),
    pausedByUserId: text('paused_by_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),

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
      index('webhook_endpoints_tenant_server_idx').on(
        table.tenantId,
        table.serverId,
      ),
      index('webhook_endpoints_runnable_idx')
        .on(table.tenantId, table.serverId)
        .where(sql`${ table.enabled } = true
          AND ${ table.pausedAt } IS NULL`),
    ]
  },
)

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => { return webhookEndpoints.id }, { onDelete: 'cascade' }),

    // 'delivered' | 'failed'
    status: text('status').notNull(),
    // NULL when no response was received (refused / DNS / timeout).
    responseStatus: integer('response_status'),

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
      index('webhook_deliveries_endpoint_created_idx').on(
        table.endpointId,
        table.createdAt.desc(),
      ),
      index('webhook_deliveries_tenant_failed_idx')
        .on(table.tenantId, table.createdAt.desc())
        .where(sql`${ table.status } = 'failed'`),
    ]
  },
)
