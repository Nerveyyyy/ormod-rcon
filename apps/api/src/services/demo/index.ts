import { seedDemoData } from './demo-data-seeder.js'
import { startLogSimulator } from './demo-log-simulator.js'

export async function initDemoMode(serverId: string): Promise<void> {
  await seedDemoData(serverId)
  startLogSimulator(serverId)
}
