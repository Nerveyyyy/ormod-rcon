import type { AppLogger } from '../lib/logger.js'

export interface Scheduler {
  start (): Promise<void>
  stop (): Promise<void>
}

export interface CreateSchedulerDeps {
  logger: AppLogger
}

/**
 * Cron-driven task runner. No-op skeleton for now. Will own: loading
 * scheduled tasks from the database, resolving next-fire times, emitting
 * RCON commands at the right moment, and writing execution rows.
 */
export const createScheduler = (deps: CreateSchedulerDeps): Scheduler => {
  const log = deps.logger.child({ component: 'scheduler' })

  return {
    start: () => {
      log.info('[scheduler] started (no-op scaffold)')
      return Promise.resolve()
    },
    stop: () => {
      log.info('[scheduler] stopped')
      return Promise.resolve()
    },
  }
}
