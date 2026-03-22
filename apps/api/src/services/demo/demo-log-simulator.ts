import type { EventEmitter } from 'node:events'
import { dockerManager } from '../docker-manager.js'

const STARTUP_LINES = [
  'ORMOD: Directive Server v1.9.0',
  'Loading world "New World 412"...',
  'World seed: 1627533',
  'Generating terrain...',
  'Loading 331036 objects...',
  'Loading 7313 entities...',
  'Loading player data (8 profiles)...',
  'Restoring structure data...',
  'Initializing weather system: clear',
  'Initializing loot tables (142 spawn points)...',
  'Initializing animal spawns...',
  'Server listening on 0.0.0.0:27015 (query: 27016)',
  'Server is ready. Game type: Cooperative',
  '',
  'Player Ironhide (76561198000000001) connected',
  'Player VaultDweller (76561198000000002) connected',
  'Player FrostByte (76561198000000003) connected',
  'Player ShadowPine (76561198000000004) connected',
  'Player CopperRidge (76561198000000005) connected',
  '',
  'Auto-save complete (2.3s)',
  'Day changed to 47',
  'Loot respawn cycle completed (142 containers)',
  'Weather transitioning to cloudy',
  '',
  'Entity cleanup: removed 23 expired items',
  'Animal respawn: 14 new spawns',
  'Auto-save complete (1.8s)',
]

const PERIODIC_LINES = [
  'Auto-save complete (1.8s)',
  'Auto-save complete (2.1s)',
  'Auto-save complete (1.5s)',
  'Loot respawn cycle completed (142 containers)',
  'Loot respawn cycle completed (138 containers)',
  'Entity cleanup: removed 19 expired items',
  'Entity cleanup: removed 31 expired items',
  'Animal respawn: 8 new spawns',
  'Animal respawn: 12 new spawns',
  'Weather transitioning to clear',
  'Weather transitioning to overcast',
  'Weather transitioning to stormy',
  'Player FrostByte killed Bear at (-234, 12, 891)',
  'Player Ironhide killed Wolf at (102, 8, -445)',
  'Player VaultDweller crafted Rifle',
  'Player ShadowPine built Structure at (55, 20, 300)',
  'Player CopperRidge harvested Iron Ore (x12)',
  'Structure decay: removed 3 abandoned structures',
  'Day changed to 48',
  'Day changed to 49',
]

function timestamp(): string {
  const now = new Date()
  return `[${now.toISOString().replace('T', ' ').slice(0, 19)}]`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

export function startLogSimulator(serverId: string): void {
  const emitter: EventEmitter = dockerManager.initDemoOutput(serverId)
  const buffer = dockerManager.getOutputBuffer(serverId)

  // Fill initial buffer
  for (const line of STARTUP_LINES) {
    const formatted = line ? `${timestamp()} ${line}` : ''
    buffer.push(formatted)
  }

  // Emit periodic lines at random intervals (5-15 seconds)
  function emitLine() {
    const line = `${timestamp()} ${pick(PERIODIC_LINES)}`
    buffer.push(line)
    // Keep buffer at max 1000 lines
    while (buffer.length > 1000) buffer.shift()
    emitter.emit('line', line)

    // Schedule next line at random interval
    const delay = 5000 + Math.random() * 10000
    intervalHandle = setTimeout(emitLine, delay)
  }

  // Start after a short delay
  intervalHandle = setTimeout(emitLine, 3000)
}

export function stopLogSimulator(): void {
  if (intervalHandle) {
    clearTimeout(intervalHandle)
    intervalHandle = null
  }
}
