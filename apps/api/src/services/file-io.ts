import fs from 'fs/promises'
import path from 'path'

export class FileIOService {
  constructor(private savePath: string) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.savePath, { recursive: true })
  }

  // ── serversettings.json ───────────────────────────────────────────────────

  async readSettings(): Promise<Record<string, unknown>> {
    const p = path.join(this.savePath, 'serversettings.json')
    try {
      const raw = await fs.readFile(p, 'utf-8')
      return JSON.parse(raw)
    } catch {
      // File doesn't exist yet (fresh server) — return sensible defaults
      return {}
    }
  }

  async writeSettings(data: Record<string, unknown>): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(
      path.join(this.savePath, 'serversettings.json'),
      JSON.stringify(data, null, 2),
      'utf-8'
    )
    // No restart needed — the game hot-reloads this file
  }

  // ── Access lists (banlist.txt / whitelist.txt / adminlist.txt) ────────────

  async readList(filename: 'banlist.txt' | 'whitelist.txt' | 'adminlist.txt'): Promise<string[]> {
    const p = path.join(this.savePath, filename)
    try {
      const raw = await fs.readFile(p, 'utf-8')
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    } catch {
      return [] // file not created yet
    }
  }

  async writeList(
    filename: 'banlist.txt' | 'whitelist.txt' | 'adminlist.txt',
    lines: string[]
  ): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(path.join(this.savePath, filename), lines.join('\n') + '\n', 'utf-8')
  }

  // ── Player data files (PlayerData/*.json) ─────────────────────────────────
  // Returns an empty array on first boot before any player has connected.

  async listPlayers(): Promise<{ steamId: string; data: unknown }[]> {
    const dir = path.join(this.savePath, 'PlayerData')
    let files: string[]
    try {
      files = await fs.readdir(dir)
    } catch {
      return [] // directory doesn't exist yet
    }
    return Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          try {
            return {
              steamId: f.replace('.json', ''),
              data: JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8')),
            }
          } catch {
            return { steamId: f.replace('.json', ''), data: {} }
          }
        })
    )
  }

  // ── Generic file / directory deletion ─────────────────────────────────────

  async deleteFileOrDir(name: string): Promise<void> {
    const target = path.join(this.savePath, name)
    try {
      const stat = await fs.stat(target)
      if (stat.isDirectory()) {
        await fs.rm(target, { recursive: true, force: true })
      } else {
        await fs.unlink(target)
      }
    } catch {
      // Already gone — that's fine
    }
  }
}
