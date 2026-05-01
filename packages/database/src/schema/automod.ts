/**
 * Automod — per-server rules that react to joins, chat, and live stats,
 * plus a fire-and-forget execution history.
 *
 * Each rule is per-server (no cross-server junction). A rule has a
 * fixed `trigger_type` from a known set with a `config` JSONB shaped
 * per trigger; a Zod discriminated union validates app-side.
 *
 * Trigger types (config shape):
 *   vac_ban         { }                              join-time Steam VAC
 *   game_ban        { }                              join-time Steam game-ban
 *   high_hs_percent { threshold_pct, min_kills }
 *   vpn_proxy       { }                              join-time IP risk
 *   high_ping       { threshold_ms, duration_s }
 *   new_account     { max_age_days }
 *   chat_profanity  { words: string[] }
 *   high_kd         { threshold, min_kills }
 *
 * Cooldown is evaluated against `automod_executions`. There is no
 * `ban` action — banning is always operator-initiated.
 *
 * Executions: one row per firing, written only when the action
 * completed. Trigger context lives in `details` JSONB.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization, user } from './auth-references.js'
import { servers } from './servers.js'
import { players } from './players.js'

export const automodRules = pgTable(
  'automod_rules',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),

    triggerType: text('trigger_type').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),

    // 'kick' | 'warn' | 'alert' | 'watchlist' | 'alert_and_watchlist' | 'mute'
    action: text('action').notNull(),
    // Set for kick / warn / mute.
    playerMessage: text('player_message'),
    // Set only when action = 'mute'.
    muteDurationSeconds: integer('mute_duration_seconds'),

    // 'none' | 'per_session' | 'per_player'
    cooldownScope: text('cooldown_scope').notNull().default('none'),

    // Denormalised for the rule-card UI ("Last Triggered 2h ago").
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),

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
      index('automod_rules_tenant_server_idx').on(
        table.tenantId,
        table.serverId,
      ),
      // Runtime walk: enabled rules per server.
      index('automod_rules_runnable_idx')
        .on(table.tenantId, table.serverId)
        .where(sql`${ table.enabled } = true`),
    ]
  },
)

export const automodExecutions = pgTable(
  'automod_executions',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => { return automodRules.id }, { onDelete: 'cascade' }),
    // SET NULL so executions survive player deletion.
    playerId: uuid('player_id').references(
      () => { return players.id },
      { onDelete: 'set null' },
    ),

    triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull(),
    // Same value space as `automod_rules.action`. Captured here so rule
    // edits don't rewrite history.
    actionTaken: text('action_taken').notNull(),

    // Trigger-specific snapshot ({ hs_pct, kill_count }, { ping_ms,
    // duration_s }, { message, matched_word }, etc.).
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),

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
      index('automod_executions_tenant_rule_triggered_idx').on(
        table.tenantId,
        table.ruleId,
        table.triggeredAt.desc(),
      ),
      index('automod_executions_tenant_server_triggered_idx').on(
        table.tenantId,
        table.serverId,
        table.triggeredAt.desc(),
      ),
      index('automod_executions_tenant_player_triggered_idx').on(
        table.tenantId,
        table.playerId,
        table.triggeredAt.desc(),
      ),
    ]
  },
)
