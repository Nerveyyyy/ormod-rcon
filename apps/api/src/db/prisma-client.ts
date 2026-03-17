import Database from 'better-sqlite3'
import cron from 'node-cron'
import { PrismaClient } from '../../prisma/generated/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

// Raw better-sqlite3 instance — exported for maintenance scheduling.
let _db: InstanceType<typeof Database> | undefined
let _prisma: PrismaClient | undefined

function getClient(): PrismaClient {
  if (!_prisma) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')

    // Strip the "file:" prefix to get the filesystem path.
    const dbPath = url.replace(/^file:/, '')
    _db = new Database(dbPath)

    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    _db.pragma('busy_timeout = 5000')

    _prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
  }
  return _prisma
}

// Proxy so all existing importers work unchanged.
// Defers adapter/client creation until the first property access,
// ensuring DATABASE_URL is available regardless of module-eval order.
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export default prisma

// Runs a weekly WAL checkpoint + VACUUM + ANALYZE on Sunday at 03:00.
export function scheduleSqliteMaintenance() {
  cron.schedule('0 3 * * 0', () => {
    try {
      const db = _db
      if (!db) return
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.exec('VACUUM')
      db.exec('ANALYZE')
    } catch (err) {
      console.error('[sqlite] Maintenance failed:', err)
    }
  })
}
