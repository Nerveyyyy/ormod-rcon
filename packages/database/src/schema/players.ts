/**
 * Players, sessions, admin notes, and moderation flags.
 *
 * A player is unique per tenant. Connection metadata (display name, IP)
 * lives on the session row. Combat stats derive from `death_events`;
 * session duration derives from `left_at - joined_at`.
 *
 * `player_flags` are lightweight automatic markers (no manual writes,
 * no author attribution); each row is one active flag of a known type.
 * Flags are removed by deletion rather than a `cleared_at` column.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),

    steamId: text('steam_id').notNull(),
    displayName: text('display_name').notNull(),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),

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
      unique('players_tenant_steam_id_unique').on(
        table.tenantId,
        table.steamId,
      ),
      index('players_tenant_last_seen_idx').on(
        table.tenantId,
        table.lastSeenAt.desc(),
      ),
    ]
  },
)

export const playerSessions = pgTable(
  'player_sessions',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => { return players.id }, { onDelete: 'cascade' }),

    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    // NULL while session is open.
    leftAt: timestamp('left_at', { withTimezone: true }),
    // 'disconnect' | 'kick' | 'ban' | 'timeout' | 'error'
    endReason: text('end_reason'),

    // Captured from player.join.
    joinDisplayName: text('join_display_name').notNull(),
    joinIp: text('join_ip').notNull(),
    // Immutable for the life of the session — historical reads only.
    joinPingMs: integer('join_ping_ms'),

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
      index('player_sessions_tenant_server_joined_idx').on(
        table.tenantId,
        table.serverId,
        table.joinedAt.desc(),
      ),
      index('player_sessions_tenant_player_joined_idx').on(
        table.tenantId,
        table.playerId,
        table.joinedAt.desc(),
      ),
      // At most one open session per (server, player).
      uniqueIndex('player_sessions_open_session_unique')
        .on(table.serverId, table.playerId)
        .where(sql`${ table.leftAt } IS NULL`),
    ]
  },
)

export const playerFlags = pgTable(
  'player_flags',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => { return players.id }, { onDelete: 'cascade' }),

    // Free text; validated app-side ('high_hs_ratio', 'vpn_detected',
    // 'new_account', 'watchlist', etc.).
    flagType: text('flag_type').notNull(),
    // 'info' | 'warning' | 'danger'
    severity: text('severity').notNull(),

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
      // One active flag per (player, flag_type); re-trigger upserts.
      unique('player_flags_player_type_unique').on(
        table.playerId,
        table.flagType,
      ),
      index('player_flags_tenant_created_idx').on(
        table.tenantId,
        table.createdAt.desc(),
      ),
    ]
  },
)

export const playerNotes = pgTable(
  'player_notes',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => { return players.id }, { onDelete: 'cascade' }),
    // SET NULL on deletion so notes survive admin turnover.
    authorUserId: text('author_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),

    body: text('body').notNull(),

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
      index('player_notes_player_created_idx').on(
        table.playerId,
        table.createdAt.desc(),
      ),
    ]
  },
)
