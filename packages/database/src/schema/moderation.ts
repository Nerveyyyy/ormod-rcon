/**
 * Bans, whitelist entries, in-game admins, and external ban list feeds.
 *
 * One `bans` table discriminated by `ban_type` ('player' | 'ip' |
 * 'hybrid'). Bans are write-once except for the lift fields. Scope is
 * either tenant-wide or per-server via `ban_server_scopes`.
 *
 * `external_ban_list_entries` mirror the feed contents; matches at
 * join-time create a normal `bans` row with `source='external'`.
 *
 * `whitelist_entries` and `server_admins` mirror per-server
 * `whitelist.txt` / `adminlist.txt`. DELETE-on-remove (no history).
 */

import {
  pgTable,
  uuid,
  text,
  inet,
  boolean,
  integer,
  timestamp,
  primaryKey,
  unique,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'
import { players } from './players.js'

export const bans = pgTable(
  'bans',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),

    // 'player' | 'ip' | 'hybrid'
    banType: text('ban_type').notNull(),

    // Set for 'player' / 'hybrid'; NULL for 'ip'.
    steamId: text('steam_id'),
    // Set for 'ip'; NULL otherwise.
    ipCidr: inet('ip_cidr'),

    // true → all servers in tenant; false → servers listed in junction.
    tenantWide: boolean('tenant_wide').notNull().default(false),

    // 'manual' | 'automod' | 'synced' | 'external' | 'auto'
    source: text('source').notNull(),
    // Upstream handle (automod rule id, external list id). Resolved by source.
    sourceRef: text('source_ref'),

    // Hybrid fan-out and auto-match lineage.
    parentBanId: uuid('parent_ban_id').references(
      (): AnyPgColumn => { return bans.id },
      { onDelete: 'set null' },
    ),

    // At most one set; both NULL for automod / external / synced / auto.
    authorUserId: text('author_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),
    bannedByPlayerId: uuid('banned_by_player_id').references(
      () => { return players.id },
      { onDelete: 'set null' },
    ),

    reasonCategory: text('reason_category'),
    reasonDetail: text('reason_detail'),

    // NULL = permanent.
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // The only mutable fields post-insert.
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    liftedByUserId: text('lifted_by_user_id').references(
      () => { return user.id },
      { onDelete: 'set null' },
    ),
    liftedReason: text('lifted_reason'),

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
      check(
        'bans_identity_shape',
        sql`(
          (${ table.banType } = 'player' AND ${ table.steamId } IS NOT NULL
            AND ${ table.ipCidr } IS NULL)
          OR (${ table.banType } = 'ip' AND ${ table.ipCidr } IS NOT NULL
            AND ${ table.steamId } IS NULL)
          OR (${ table.banType } = 'hybrid' AND ${ table.steamId } IS NOT NULL
            AND ${ table.ipCidr } IS NULL)
        )`,
      ),
      check(
        'bans_auto_has_parent',
        sql`(${ table.source } <> 'auto' OR ${ table.parentBanId } IS NOT NULL)`,
      ),
      check(
        'bans_lift_order',
        sql`(${ table.liftedAt } IS NULL
          OR ${ table.liftedAt } >= ${ table.createdAt })`,
      ),

      index('bans_tenant_created_idx').on(
        table.tenantId,
        table.createdAt.desc(),
      ),
      index('bans_active_player_idx')
        .on(table.tenantId, table.steamId)
        .where(sql`${ table.liftedAt } IS NULL
          AND ${ table.banType } IN ('player', 'hybrid')`),
      index('bans_active_ip_idx')
        .on(table.ipCidr)
        .where(sql`${ table.liftedAt } IS NULL
          AND ${ table.banType } = 'ip'`),
      index('bans_expiry_idx')
        .on(table.expiresAt)
        .where(sql`${ table.expiresAt } IS NOT NULL
          AND ${ table.liftedAt } IS NULL`),
      index('bans_parent_idx').on(table.parentBanId),
    ]
  },
)

export const banServerScopes = pgTable(
  'ban_server_scopes',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    banId: uuid('ban_id')
      .notNull()
      .references(() => { return bans.id }, { onDelete: 'cascade' }),
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
        name: 'ban_server_scopes_pkey',
        columns: [ table.banId, table.serverId ],
      }),
      index('ban_server_scopes_tenant_server_idx').on(
        table.tenantId,
        table.serverId,
      ),
    ]
  },
)

export const whitelistEntries = pgTable(
  'whitelist_entries',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),

    steamId: text('steam_id').notNull(),
    note: text('note'),

    // 'dashboard' | 'synced'
    source: text('source').notNull(),
    addedByUserId: text('added_by_user_id').references(
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
      unique('whitelist_entries_server_steam_unique').on(
        table.serverId,
        table.steamId,
      ),
    ]
  },
)

export const serverAdmins = pgTable(
  'server_admins',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),

    steamId: text('steam_id').notNull(),
    // 'operator' | 'admin' | 'server'
    level: text('level').notNull(),

    // 'dashboard' | 'synced'
    source: text('source').notNull(),
    addedByUserId: text('added_by_user_id').references(
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
      unique('server_admins_server_steam_unique').on(
        table.serverId,
        table.steamId,
      ),
    ]
  },
)

export const externalBanLists = pgTable(
  'external_ban_lists',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    url: text('url').notNull(),
    enabled: boolean('enabled').notNull().default(true),

    // 6h default.
    syncIntervalSeconds: integer('sync_interval_seconds')
      .notNull()
      .default(21_600),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    // 'ok' | 'failed' | NULL (never synced)
    lastSyncStatus: text('last_sync_status'),
    lastSyncError: text('last_sync_error'),
    entryCount: integer('entry_count').notNull().default(0),

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
      unique('external_ban_lists_tenant_url_unique').on(
        table.tenantId,
        table.url,
      ),
    ]
  },
)

export const externalBanListEntries = pgTable(
  'external_ban_list_entries',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => { return externalBanLists.id }, {
        onDelete: 'cascade',
      }),

    steamId: text('steam_id').notNull(),
    reason: text('reason'),
    evidenceUrl: text('evidence_url'),
    // From the feed payload if provided.
    addedAt: timestamp('added_at', { withTimezone: true }),

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
      unique('external_ban_list_entries_list_steam_unique').on(
        table.listId,
        table.steamId,
      ),
      // Hot-path check at player.join.
      index('external_ban_list_entries_tenant_steam_idx').on(
        table.tenantId,
        table.steamId,
      ),
    ]
  },
)
