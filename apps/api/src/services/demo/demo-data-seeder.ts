import prisma from '../../db/prisma-client.js'
import { generateSlug, uniqueSlug } from '../../lib/slug.js'

const DEMO_PLAYERS = [
  { steamId: '76561198000000001', displayName: 'Ironhide' },
  { steamId: '76561198000000002', displayName: 'VaultDweller' },
  { steamId: '76561198000000003', displayName: 'FrostByte' },
  { steamId: '76561198000000004', displayName: 'ShadowPine' },
  { steamId: '76561198000000005', displayName: 'CopperRidge' },
  { steamId: '76561198000000006', displayName: 'StormWatch' },
  { steamId: '76561198000000007', displayName: 'DuskTracker' },
  { steamId: '76561198000000008', displayName: 'BearTrap' },
]

const ONLINE_PLAYER_COUNT = 5

const CHAT_MESSAGES = [
  { channel: 'global', message: 'anyone near the cold biome?' },
  { channel: 'global', message: 'gg nice shot' },
  { channel: 'global', message: 'bear almost got me lol' },
  { channel: 'global', message: 'trading iron for copper at base E4' },
  { channel: 'global', message: 'server feels smooth today' },
  { channel: 'team', message: 'base is at grid E4, come help build' },
  { channel: 'team', message: 'im bringing more wood' },
  { channel: 'global', message: 'anyone want to team up?' },
  { channel: 'global', message: 'just found a rifle in the bunker' },
  { channel: 'team', message: 'watch out theres a wolf pack near river' },
  { channel: 'global', message: 'where do i find copper ore?' },
  { channel: 'global', message: 'north mountains, bring warm clothes' },
  { channel: 'global', message: 'nice base dude' },
  { channel: 'team', message: 'logging off for tonight, cya' },
  { channel: 'global', message: 'how do you make a furnace?' },
  { channel: 'global', message: 'craft menu > structures > smelting' },
  { channel: 'global', message: 'thanks!' },
  { channel: 'global', message: 'wipe coming friday btw' },
  { channel: 'team', message: 'we need more stone for walls' },
  { channel: 'global', message: 'just got killed by lightning lmao' },
]

const DEATH_CAUSES_PVE = ['Bear', 'Wolf', 'Fall', 'Bleeding', 'Drowning', 'Lightning', 'Hypothermia']
const WEAPONS = ['Rifle', 'Shotgun', 'Pistol', 'Bow', 'Crossbow', 'Spear']

const GAME_EVENTS = [
  { name: 'server.save', details: '{"duration": "2.3s"}' },
  { name: 'server.save', details: '{"duration": "1.8s"}' },
  { name: 'server.save', details: '{"duration": "2.1s"}' },
  { name: 'server.save', details: '{"duration": "1.5s"}' },
  { name: 'server.restart', details: '{"reason": "scheduled"}' },
  { name: 'server.restart', details: '{"reason": "manual"}' },
  { name: 'server.start', details: '{"version": "1.9.0"}' },
  { name: 'world.loot.respawn', details: '{"containers": 142}' },
  { name: 'world.loot.respawn', details: '{"containers": 138}' },
  { name: 'world.loot.respawn', details: '{"containers": 155}' },
  { name: 'world.day.change', details: '{"day": 46}' },
  { name: 'world.day.change', details: '{"day": 47}' },
  { name: 'world.weather.change', details: '{"type": "cloudy"}' },
  { name: 'world.weather.change', details: '{"type": "clear"}' },
  { name: 'server.setting.change', details: '{"key": "MaxPlayers", "value": 40}' },
]

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000)
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86400_000)
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export async function seedDemoData(serverId: string): Promise<void> {
  // Idempotency: check if we already seeded
  const existing = await prisma.player.findUnique({ where: { steamId: DEMO_PLAYERS[0]!.steamId } })
  if (existing) return

  // Create global Player records
  const playerRecords = await Promise.all(
    DEMO_PLAYERS.map((p) =>
      prisma.player.create({
        data: {
          steamId: p.steamId,
          displayName: p.displayName,
          firstSeen: daysAgo(randomBetween(3, 14)),
          lastSeen: hoursAgo(randomBetween(0, 2)),
        },
      })
    )
  )

  // Create PlayerServerStats
  await Promise.all(
    playerRecords.map((p) =>
      prisma.playerServerStats.create({
        data: {
          playerId: p.id,
          serverId,
          totalTime: randomBetween(3600, 72000),
          firstSeen: p.firstSeen,
          lastSeen: p.lastSeen,
        },
      })
    )
  )

  // Create online sessions (first N players are online)
  for (let i = 0; i < ONLINE_PLAYER_COUNT; i++) {
    const p = playerRecords[i]!
    await prisma.playerSession.create({
      data: {
        playerId: p.id,
        serverId,
        displayName: DEMO_PLAYERS[i]!.displayName,
        joinedAt: hoursAgo(randomBetween(0, 3)),
        leftAt: null,
      },
    })
  }

  // Create historical closed sessions
  for (let i = 0; i < 18; i++) {
    const p = pick(playerRecords)
    const joinedAt = hoursAgo(randomBetween(6, 168))
    const duration = randomBetween(1200, 10800)
    await prisma.playerSession.create({
      data: {
        playerId: p.id,
        serverId,
        displayName: DEMO_PLAYERS.find((dp) => dp.steamId === p.steamId)!.displayName,
        joinedAt,
        leftAt: new Date(joinedAt.getTime() + duration * 1000),
        duration,
        reason: pick(['disconnect', 'disconnect', 'disconnect', 'timeout']),
      },
    })
  }

  // Create CombatLog entries (mix of PvP and PvE)
  for (let i = 0; i < 30; i++) {
    const victim = pick(playerRecords)
    const isPvP = Math.random() < 0.4
    const killer = isPvP ? pick(playerRecords.filter((p) => p.id !== victim.id)) : null

    await prisma.combatLog.create({
      data: {
        serverId,
        playerId: victim.id,
        displayName: DEMO_PLAYERS.find((dp) => dp.steamId === victim.steamId)!.displayName,
        cause: isPvP ? 'Gunshot' : pick(DEATH_CAUSES_PVE),
        killerSteamId: killer?.steamId ?? null,
        killerDisplayName: killer ? DEMO_PLAYERS.find((dp) => dp.steamId === killer.steamId)!.displayName : null,
        weapon: isPvP ? pick(WEAPONS) : null,
        createdAt: hoursAgo(randomBetween(0, 168)),
      },
    })
  }

  // Create PlayerChat entries
  for (let i = 0; i < CHAT_MESSAGES.length; i++) {
    const p = pick(playerRecords)
    const msg = CHAT_MESSAGES[i]!
    await prisma.playerChat.create({
      data: {
        serverId,
        playerId: p.id,
        displayName: DEMO_PLAYERS.find((dp) => dp.steamId === p.steamId)!.displayName,
        message: msg.message,
        channel: msg.channel,
        createdAt: hoursAgo(randomBetween(0, 48)),
      },
    })
  }

  // Create GameEvents
  for (let i = 0; i < GAME_EVENTS.length; i++) {
    const evt = GAME_EVENTS[i]!
    await prisma.gameEvent.create({
      data: {
        serverId,
        name: evt.name,
        details: evt.details,
        createdAt: hoursAgo(randomBetween(0, 168)),
      },
    })
  }

  // Create WipeLogs
  await prisma.wipeLog.create({
    data: {
      serverId,
      triggeredBy: 'demo-admin',
      type: 'full',
      success: true,
      notes: 'Scheduled full wipe',
      createdAt: daysAgo(14),
    },
  })
  await prisma.wipeLog.create({
    data: {
      serverId,
      triggeredBy: 'demo-admin',
      type: 'map',
      success: true,
      notes: 'Mid-week map wipe',
      createdAt: daysAgo(7),
    },
  })

  // Create AccessLists with entries
  const banSlug = await uniqueSlug('global-ban-list', async (s) => {
    const e = await prisma.accessList.findUnique({ where: { slug: s } })
    return !!e
  })
  const banList = await prisma.accessList.create({
    data: {
      name: 'Global Ban List',
      slug: banSlug,
      type: 'BAN',
      scope: 'GLOBAL',
      description: 'Server-wide ban list',
    },
  })
  await prisma.listEntry.createMany({
    data: [
      { listId: banList.id, steamId: '76561198099999901', playerName: 'Griefer123', reason: 'Exploiting' },
      { listId: banList.id, steamId: '76561198099999902', playerName: 'ToxicPlayer', reason: 'Harassment' },
    ],
  })
  await prisma.serverListLink.create({ data: { serverId, listId: banList.id } })

  const wlSlug = await uniqueSlug('vip-whitelist', async (s) => {
    const e = await prisma.accessList.findUnique({ where: { slug: s } })
    return !!e
  })
  const whitelist = await prisma.accessList.create({
    data: {
      name: 'VIP Whitelist',
      slug: wlSlug,
      type: 'WHITELIST',
      scope: 'SERVER',
      description: 'Priority access for VIP players',
    },
  })
  await prisma.listEntry.createMany({
    data: [
      { listId: whitelist.id, steamId: DEMO_PLAYERS[0]!.steamId, playerName: DEMO_PLAYERS[0]!.displayName },
      { listId: whitelist.id, steamId: DEMO_PLAYERS[1]!.steamId, playerName: DEMO_PLAYERS[1]!.displayName },
      { listId: whitelist.id, steamId: DEMO_PLAYERS[2]!.steamId, playerName: DEMO_PLAYERS[2]!.displayName },
    ],
  })
  await prisma.serverListLink.create({ data: { serverId, listId: whitelist.id } })

  // Create ScheduledTasks
  const restartSlug = await uniqueSlug('daily-restart', async (s) => {
    const e = await prisma.scheduledTask.findUnique({ where: { slug: s } })
    return !!e
  })
  await prisma.scheduledTask.create({
    data: {
      serverId,
      type: 'RESTART',
      cronExpr: '0 6 * * *',
      label: 'Daily Restart',
      slug: restartSlug,
      payload: '',
      enabled: true,
      nextRun: new Date(Date.now() + 86400_000),
    },
  })

  const saveSlug = await uniqueSlug('hourly-save', async (s) => {
    const e = await prisma.scheduledTask.findUnique({ where: { slug: s } })
    return !!e
  })
  await prisma.scheduledTask.create({
    data: {
      serverId,
      type: 'COMMAND',
      cronExpr: '0 * * * *',
      label: 'Hourly Save',
      slug: saveSlug,
      payload: 'forcesave',
      enabled: true,
      nextRun: new Date(Date.now() + 3600_000),
    },
  })
}
