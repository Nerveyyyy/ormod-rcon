/**
 * Servers, runtime state, and time-series metrics.
 *
 * server_runtime is split from servers so heartbeat writes don't touch
 * the row holding encrypted RCON credentials. server_metrics is the
 * append-only history powering dashboard graphs.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  real,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core'
import { organization } from './auth-references.js'

export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),

    handle: text('handle').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    region: text('region'),

    // Admin RCON endpoint. Password encrypted at rest.
    rconHost: text('rcon_host').notNull(),
    rconPort: integer('rcon_port').notNull(),
    rconPasswordEncrypted: text('rcon_password_encrypted').notNull(),

    // Player-facing endpoint, reported by RCON `serverstatus`.
    gameIp: text('game_ip'),
    gamePort: integer('game_port'),
    serverNameReported: text('server_name_reported'),
    gameVersion: text('game_version'),
    rconProtocolVersion: text('rcon_protocol_version'),
    seed: text('seed'),
    maxPlayers: integer('max_players'),
    saveIntervalSeconds: integer('save_interval_seconds'),
    serverStartedAt: timestamp('server_started_at', { withTimezone: true }),

    enabled: boolean('enabled').notNull().default(true),
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
      unique('servers_tenant_handle_unique').on(
        table.tenantId,
        table.handle,
      ),
    ]
  },
)

export const serverRuntime = pgTable('server_runtime', {
  serverId: uuid('server_id')
    .primaryKey()
    .references(() => { return servers.id }, { onDelete: 'cascade' }),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => { return organization.id }, { onDelete: 'cascade' }),
  connectionState: text('connection_state').notNull(),
  playerCount: integer('player_count'),
  latencyMs: integer('latency_ms'),
  // Free-text reason describing why the connection is in its current state.
  // Set when transitioning to a non-healthy state (errored, disconnected with
  // cause); cleared when transitioning to `connected`. Drives dashboard copy
  // such as "RCON authentication failed — invalid password".
  lastErrorReason: text('last_error_reason'),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  lastDisconnectedAt: timestamp('last_disconnected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => { return new Date() }),
})

export const serverMetrics = pgTable(
  'server_metrics',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => { return organization.id }, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => { return servers.id }, { onDelete: 'cascade' }),
    playerCount: integer('player_count').notNull(),
    connectionState: text('connection_state').notNull(),
    latencyMs: integer('latency_ms'),
    tickRateHz: real('tick_rate_hz'),
    memoryMb: integer('memory_mb'),
    avgFrameMs: real('avg_frame_ms'),
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
      index('server_metrics_tenant_server_created_idx').on(
        table.tenantId,
        table.serverId,
        table.createdAt.desc(),
      ),
    ]
  },
)