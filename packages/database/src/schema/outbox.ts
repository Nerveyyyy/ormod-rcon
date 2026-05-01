/**
 * Transactional outbox — durable buffer between state-changing
 * transactions and external delivery (webhooks, etc.).
 *
 * Every state-mutating tx appends a row in the same tx. An async
 * dispatcher drains pending rows via `SELECT ... FOR UPDATE SKIP
 * LOCKED`. Stale `processing` rows are recovered by a janitor sweep.
 *
 * `available_at` is the not-before timestamp; pushed forward on
 * transient failure (exponential backoff is app-side policy). After
 * a retry ceiling the row moves to `dead` and is kept for ops review.
 * Retention purges `delivered`.
 *
 * Per-tenant FIFO falls out of `ORDER BY created_at`. Cross-tenant
 * ordering is intentionally not guaranteed.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization } from './auth-references.js'

export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),

    // 'ban.created', 'wipe.completed', etc. Free text; validated app-side.
    topic: text('topic').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),

    // 'pending' | 'processing' | 'delivered' | 'failed' | 'dead'
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),

    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    // Set when status moves to 'delivered' or 'dead'.
    processedAt: timestamp('processed_at', { withTimezone: true }),

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
      // Picker hot path; per-tenant FIFO from created_at.
      index('event_outbox_pending_idx')
        .on(table.tenantId, table.availableAt, table.createdAt)
        .where(sql`${ table.status } = 'pending'`),
      // Stuck-lock recovery.
      index('event_outbox_stuck_idx')
        .on(table.lockedAt)
        .where(sql`${ table.status } = 'processing'`),
      // Retention sweep.
      index('event_outbox_retention_idx')
        .on(table.processedAt)
        .where(sql`${ table.status } = 'delivered'`),
      // Dead-letter inspection.
      index('event_outbox_dead_idx')
        .on(table.tenantId, table.processedAt.desc())
        .where(sql`${ table.status } = 'dead'`),
    ]
  },
)
