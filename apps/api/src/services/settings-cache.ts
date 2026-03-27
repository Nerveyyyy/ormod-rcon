/**
 * settings-cache.ts
 *
 * In-memory TTL cache for server settings. Avoids sending `getserversettings`
 * to the game server on every Settings page load.
 *
 * - 30-minute TTL (settings rarely change)
 * - Invalidate-on-write: any successful setting change clears the cache
 * - Manual refresh via `?refresh=true` query param bypasses cache
 */

type SettingValue = string | number | boolean

interface CacheEntry {
  settings: Record<string, SettingValue>
  fetchedAt: number // Date.now()
}

const TTL_MS = 30 * 60 * 1000 // 30 minutes

class SettingsCache {
  private cache = new Map<string, CacheEntry>()

  get(serverId: string): CacheEntry | null {
    const entry = this.cache.get(serverId)
    if (!entry) return null
    if (Date.now() - entry.fetchedAt > TTL_MS) {
      this.cache.delete(serverId)
      return null
    }
    return entry
  }

  set(serverId: string, settings: Record<string, SettingValue>): CacheEntry {
    const entry: CacheEntry = { settings, fetchedAt: Date.now() }
    this.cache.set(serverId, entry)
    return entry
  }

  invalidate(serverId: string): void {
    this.cache.delete(serverId)
  }

  invalidateAll(): void {
    this.cache.clear()
  }
}

export const settingsCache = new SettingsCache()
