/**
 * Game event tables.
 *
 * `chat_messages`, `death_events`, and `anticheat_alerts` are first-class
 * stores for their respective RCON events — ingest writes directly per
 * `event.name`, not via a ledger projection.
 *
 * `game_events` is the catch-all for events without a typed table
 * (lifecycle, world, kicks, unknowns). Full body in `payload`. Per-event
 * fields graduate to their own table when filtering/indexing warrants.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  real,
  index,
} from 'drizzle-orm/pg-core'
import { organization } from './auth-references.js'
import { servers } from './servers.js'
import { players } from './players.js'

export const gameEvents = pgTable(
  'game_events',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
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
      index('game_events_tenant_server_created_idx').on(
        table.tenantId,
        table.serverId,
        table.createdAt.desc(),
      ),
      index('game_events_tenant_server_type_created_idx').on(
        table.tenantId,
        table.serverId,
        table.type,
        table.createdAt.desc(),
      ),
    ]
  },
)

export const chatMessages = pgTable(
  'chat_messages',
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

    // 'global' | 'team' | 'local'
    channel: text('channel').notNull(),
    message: text('message').notNull(),

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
      index('chat_messages_tenant_server_created_idx').on(
        table.tenantId,
        table.serverId,
        table.createdAt.desc(),
      ),
      index('chat_messages_tenant_player_created_idx').on(
        table.tenantId,
        table.playerId,
        table.createdAt.desc(),
      ),
    ]
  },
)

export const deathEvents = pgTable(
  'death_events',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),

    victimPlayerId: uuid('victim_player_id')
      .notNull()
      .references(() => { return players.id }, { onDelete: 'cascade' }),
    // Set only when source='player'.
    killerPlayerId: uuid('killer_player_id').references(
      () => { return players.id },
      { onDelete: 'set null' },
    ),
    // Set only when source='ai'.
    killerNpcType: text('killer_npc_type'),

    // 'suicide' | 'environment' | 'ai' | 'player'
    source: text('source').notNull(),
    cause: text('cause').notNull(),

    victimX: real('victim_x').notNull(),
    victimY: real('victim_y').notNull(),
    victimZ: real('victim_z').notNull(),
    // PvP only.
    killerX: real('killer_x'),
    killerY: real('killer_y'),
    killerZ: real('killer_z'),

    weaponItemId: text('weapon_item_id'),
    weaponName: text('weapon_name'),
    weaponAmmoType: text('weapon_ammo_type'),
    weaponAttachments: jsonb('weapon_attachments'),

    // 'head' | 'chest' | 'stomach' | 'arm_left' | 'arm_right' |
    // 'leg_left' | 'leg_right' | 'other'
    hitZone: text('hit_zone'),
    hitDistanceMeters: real('hit_distance_meters'),

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
      index('death_events_tenant_server_created_idx').on(
        table.tenantId,
        table.serverId,
        table.createdAt.desc(),
      ),
      index('death_events_tenant_killer_created_idx').on(
        table.tenantId,
        table.killerPlayerId,
        table.createdAt.desc(),
      ),
      index('death_events_tenant_victim_created_idx').on(
        table.tenantId,
        table.victimPlayerId,
        table.createdAt.desc(),
      ),
    ]
  },
)

export const anticheatAlerts = pgTable(
  'anticheat_alerts',
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

    // Free text — 'aimbot', 'speedhack', 'teleport', 'noclip', 'esp',
    // 'weapon_mod', 'memory_tamper', 'unknown'.
    detectionType: text('detection_type').notNull(),
    // 'low' | 'medium' | 'high' | 'critical'
    severity: text('severity').notNull(),
    details: text('details'),

    locationX: real('location_x'),
    locationY: real('location_y'),
    locationZ: real('location_z'),

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
      index('anticheat_alerts_tenant_server_created_idx').on(
        table.tenantId,
        table.serverId,
        table.createdAt.desc(),
      ),
      index('anticheat_alerts_tenant_player_created_idx').on(
        table.tenantId,
        table.playerId,
        table.createdAt.desc(),
      ),
    ]
  },
)
