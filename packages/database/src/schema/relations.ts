/**
 * Drizzle relations for the typed query API.
 *
 * Enables `db.query.<table>.findMany({ with: { ... } })`. Manual joins
 * via `select().leftJoin(...)` continue to work without these.
 */

import { relations } from 'drizzle-orm'
import { servers, serverRuntime, serverMetrics } from './servers.js'
import { serverPermissions } from './server-permissions.js'
import {
  players,
  playerSessions,
  playerFlags,
  playerNotes,
} from './players.js'
import {
  gameEvents,
  chatMessages,
  deathEvents,
  anticheatAlerts,
} from './events.js'
import {
  bans,
  banServerScopes,
  whitelistEntries,
  serverAdmins,
  externalBanLists,
  externalBanListEntries,
} from './moderation.js'
import { wipeSchedules, wipeRuns } from './wipes.js'
import { activityLog } from './activity-log.js'
import {
  scheduledTasks,
  scheduledTaskServers,
  scheduledTaskExecutions,
} from './schedules.js'
import { automodRules, automodExecutions } from './automod.js'
import { webhookEndpoints, webhookDeliveries } from './webhooks.js'

export const serversRelations = relations(servers, ({ one, many }) => {
  return {
    runtime: one(serverRuntime, {
      fields: [ servers.id ],
      references: [ serverRuntime.serverId ],
    }),
    metrics: many(serverMetrics),
    permissions: many(serverPermissions),
    sessions: many(playerSessions),
    banScopes: many(banServerScopes),
    whitelistEntries: many(whitelistEntries),
    admins: many(serverAdmins),
    automodRules: many(automodRules),
    wipeSchedules: many(wipeSchedules),
    webhookEndpoints: many(webhookEndpoints),
    scheduledTaskTargets: many(scheduledTaskServers),
  }
})

export const serverRuntimeRelations = relations(serverRuntime, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ serverRuntime.serverId ],
      references: [ servers.id ],
    }),
  }
})

export const serverMetricsRelations = relations(serverMetrics, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ serverMetrics.serverId ],
      references: [ servers.id ],
    }),
  }
})

export const serverPermissionsRelations = relations(
  serverPermissions,
  ({ one }) => {
    return {
      server: one(servers, {
        fields: [ serverPermissions.serverId ],
        references: [ servers.id ],
      }),
    }
  },
)

export const playersRelations = relations(players, ({ many }) => {
  return {
    sessions: many(playerSessions),
    flags: many(playerFlags),
    notes: many(playerNotes),
  }
})

export const playerSessionsRelations = relations(playerSessions, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ playerSessions.serverId ],
      references: [ servers.id ],
    }),
    player: one(players, {
      fields: [ playerSessions.playerId ],
      references: [ players.id ],
    }),
  }
})

export const playerFlagsRelations = relations(playerFlags, ({ one }) => {
  return {
    player: one(players, {
      fields: [ playerFlags.playerId ],
      references: [ players.id ],
    }),
  }
})

export const playerNotesRelations = relations(playerNotes, ({ one }) => {
  return {
    player: one(players, {
      fields: [ playerNotes.playerId ],
      references: [ players.id ],
    }),
  }
})

export const chatMessagesRelations = relations(chatMessages, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ chatMessages.serverId ],
      references: [ servers.id ],
    }),
    player: one(players, {
      fields: [ chatMessages.playerId ],
      references: [ players.id ],
    }),
  }
})

export const deathEventsRelations = relations(deathEvents, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ deathEvents.serverId ],
      references: [ servers.id ],
    }),
    victim: one(players, {
      fields: [ deathEvents.victimPlayerId ],
      references: [ players.id ],
      relationName: 'death_victim',
    }),
    killer: one(players, {
      fields: [ deathEvents.killerPlayerId ],
      references: [ players.id ],
      relationName: 'death_killer',
    }),
  }
})

export const anticheatAlertsRelations = relations(
  anticheatAlerts,
  ({ one }) => {
    return {
      server: one(servers, {
        fields: [ anticheatAlerts.serverId ],
        references: [ servers.id ],
      }),
      player: one(players, {
        fields: [ anticheatAlerts.playerId ],
        references: [ players.id ],
      }),
    }
  },
)

export const gameEventsRelations = relations(gameEvents, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ gameEvents.serverId ],
      references: [ servers.id ],
    }),
  }
})

export const bansRelations = relations(bans, ({ one, many }) => {
  return {
    parent: one(bans, {
      fields: [ bans.parentBanId ],
      references: [ bans.id ],
      relationName: 'ban_parent',
    }),
    children: many(bans, { relationName: 'ban_parent' }),
    scopes: many(banServerScopes),
  }
})

export const banServerScopesRelations = relations(
  banServerScopes,
  ({ one }) => {
    return {
      ban: one(bans, {
        fields: [ banServerScopes.banId ],
        references: [ bans.id ],
      }),
      server: one(servers, {
        fields: [ banServerScopes.serverId ],
        references: [ servers.id ],
      }),
    }
  },
)

export const externalBanListsRelations = relations(
  externalBanLists,
  ({ many }) => {
    return {
      entries: many(externalBanListEntries),
    }
  },
)

export const externalBanListEntriesRelations = relations(
  externalBanListEntries,
  ({ one }) => {
    return {
      list: one(externalBanLists, {
        fields: [ externalBanListEntries.listId ],
        references: [ externalBanLists.id ],
      }),
    }
  },
)

export const wipeSchedulesRelations = relations(
  wipeSchedules,
  ({ one, many }) => {
    return {
      server: one(servers, {
        fields: [ wipeSchedules.serverId ],
        references: [ servers.id ],
      }),
      runs: many(wipeRuns),
    }
  },
)

export const wipeRunsRelations = relations(wipeRuns, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ wipeRuns.serverId ],
      references: [ servers.id ],
    }),
    schedule: one(wipeSchedules, {
      fields: [ wipeRuns.wipeScheduleId ],
      references: [ wipeSchedules.id ],
    }),
  }
})

export const activityLogRelations = relations(activityLog, ({ one }) => {
  return {
    server: one(servers, {
      fields: [ activityLog.serverId ],
      references: [ servers.id ],
    }),
  }
})

export const scheduledTasksRelations = relations(
  scheduledTasks,
  ({ many }) => {
    return {
      targets: many(scheduledTaskServers),
      executions: many(scheduledTaskExecutions),
    }
  },
)

export const scheduledTaskServersRelations = relations(
  scheduledTaskServers,
  ({ one }) => {
    return {
      task: one(scheduledTasks, {
        fields: [ scheduledTaskServers.taskId ],
        references: [ scheduledTasks.id ],
      }),
      server: one(servers, {
        fields: [ scheduledTaskServers.serverId ],
        references: [ servers.id ],
      }),
    }
  },
)

export const scheduledTaskExecutionsRelations = relations(
  scheduledTaskExecutions,
  ({ one }) => {
    return {
      task: one(scheduledTasks, {
        fields: [ scheduledTaskExecutions.taskId ],
        references: [ scheduledTasks.id ],
      }),
      server: one(servers, {
        fields: [ scheduledTaskExecutions.serverId ],
        references: [ servers.id ],
      }),
    }
  },
)

export const automodRulesRelations = relations(
  automodRules,
  ({ one, many }) => {
    return {
      server: one(servers, {
        fields: [ automodRules.serverId ],
        references: [ servers.id ],
      }),
      executions: many(automodExecutions),
    }
  },
)

export const automodExecutionsRelations = relations(
  automodExecutions,
  ({ one }) => {
    return {
      rule: one(automodRules, {
        fields: [ automodExecutions.ruleId ],
        references: [ automodRules.id ],
      }),
      server: one(servers, {
        fields: [ automodExecutions.serverId ],
        references: [ servers.id ],
      }),
      player: one(players, {
        fields: [ automodExecutions.playerId ],
        references: [ players.id ],
      }),
    }
  },
)

export const webhookEndpointsRelations = relations(
  webhookEndpoints,
  ({ one, many }) => {
    return {
      server: one(servers, {
        fields: [ webhookEndpoints.serverId ],
        references: [ servers.id ],
      }),
      deliveries: many(webhookDeliveries),
    }
  },
)

export const webhookDeliveriesRelations = relations(
  webhookDeliveries,
  ({ one }) => {
    return {
      endpoint: one(webhookEndpoints, {
        fields: [ webhookDeliveries.endpointId ],
        references: [ webhookEndpoints.id ],
      }),
    }
  },
)
