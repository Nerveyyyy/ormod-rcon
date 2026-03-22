import type { RconAdapter } from '../rcon-adapter.js'

const DEFAULT_SETTINGS = JSON.stringify({
  ServerName: 'Demo Server',
  MaxPlayers: 40,
  ServerPassword: '',
  PvPEnabled: true,
  DayLength: 60,
  NightLength: 12,
  ResourceMultiplier: 1.0,
  CraftingSpeedMultiplier: 1.0,
  HarvestMultiplier: 1.0,
  ExperienceMultiplier: 1.0,
  PlayerDamageMultiplier: 1.0,
  StructureDamageMultiplier: 1.0,
  AnimalSpawnMultiplier: 1.0,
  WeatherFrequency: 'normal',
  AllowCheats: false,
  AutoSaveInterval: 300,
  MaxStructuresPerPlayer: 500,
})

export class DemoAdapter implements RconAdapter {
  async sendCommand(cmd: string): Promise<string> {
    const lower = cmd.toLowerCase().trim()

    if (lower === 'getserversettings') return DEFAULT_SETTINGS
    if (lower === 'forcesave') return 'World saved successfully'
    if (lower === 'killall') return 'All entities killed (14 removed)'
    if (lower.startsWith('announcement ')) return 'Announcement sent'
    if (lower.startsWith('say ')) return 'Message broadcast to all players'
    if (lower.startsWith('setweather ')) return `Weather set to ${cmd.split(' ')[1]}`
    if (lower.startsWith('kick ')) return 'Player kicked'
    if (lower.startsWith('ban ')) return 'Player banned'
    if (lower.startsWith('unban ')) return 'Player unbanned'
    if (lower.startsWith('heal ')) return 'Player healed to full health'
    if (lower.startsWith('whitelist ')) return 'Player added to whitelist'
    if (lower.startsWith('setpermissions ')) return `Permissions set to ${cmd.split(' ').pop()}`
    if (lower.startsWith('setserversetting ')) {
      const parts = cmd.split(' ')
      return `Setting ${parts[1]} updated to ${parts.slice(2).join(' ')}`
    }
    if (lower.startsWith('wipe')) return 'Wipe initiated'

    return 'Command dispatched (demo mode)'
  }

  isConnected(): boolean {
    return true
  }
}
