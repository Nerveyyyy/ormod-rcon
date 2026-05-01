/**
 * Tenant-indifferent caches — IP reputation and Steam account state.
 * The only tables in the schema without `tenant_id`.
 *
 * Pattern: natural key as PK, structured columns + raw provider
 * payload, `expires_at` for cache-miss behaviour, `updated_at` for
 * last-refreshed. A nightly prune sweeps long-expired rows.
 */

import {
  pgTable,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'

/**
 * IP reputation cache (VPN / proxy detection).
 *
 * One row per IP. `risk` holds the raw provider payload so verdict
 * derivation stays inspectable when provider schemas drift.
 */
export const ipRiskCache = pgTable(
  'ip_risk_cache',
  {
    // Exact match — no inet because cache lookups are exact, not CIDR.
    ip: text('ip').primaryKey(),

    // 'ipinfo' | 'iphub' | ...
    provider: text('provider').notNull(),

    risk: jsonb('risk').$type<Record<string, unknown>>().notNull(),

    // 'clean' | 'vpn' | 'proxy' | 'unknown'
    verdict: text('verdict').notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

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
      index('ip_risk_cache_expires_idx').on(table.expiresAt),
    ]
  },
)

/**
 * Steam Web API cache, keyed by SteamID64.
 *
 * Powers VAC / game-ban / new-account automod and the player intel
 * panel. Steam returns `DaysSinceLastBan` (relative); we materialise
 * `last_ban_at` as `updated_at - days` so repeat fetches don't drift
 * the absolute timestamp. Profile fields are nullable for private
 * profiles — consumers must treat unknown ages conservatively.
 */
export const playerSteamCache = pgTable(
  'player_steam_cache',
  {
    // Matches `players.steam_id` shape.
    steamId: text('steam_id').primaryKey(),

    // Public profile fields (nullable for private profiles).
    personaName: text('persona_name'),
    avatarUrl: text('avatar_url'),
    // 'public' | 'friends_only' | 'private' — normalised from Steam's
    // communityvisibilitystate integer.
    profileVisibility: text('profile_visibility'),
    accountCreatedAt: timestamp('account_created_at', {
      withTimezone: true,
    }),
    // ISO 3166-1 alpha-2.
    countryCode: text('country_code'),

    // Ban state — always populated.
    vacBanned: boolean('vac_banned').notNull().default(false),
    vacBanCount: integer('vac_ban_count').notNull().default(0),
    gameBanCount: integer('game_ban_count').notNull().default(0),
    communityBanned: boolean('community_banned')
      .notNull()
      .default(false),
    // 'none' | 'probation' | 'banned' (Steam's EconomyBan).
    economyBanStatus: text('economy_ban_status').notNull(),
    // Most-recent ban across VAC and game bans.
    lastBanAt: timestamp('last_ban_at', { withTimezone: true }),

    // Raw provider response (GetPlayerSummaries + GetPlayerBans under
    // `summary` / `bans` keys).
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

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
      index('player_steam_cache_expires_idx').on(table.expiresAt),
    ]
  },
)
