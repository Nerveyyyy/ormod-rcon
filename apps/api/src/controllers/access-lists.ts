import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns/promises'
import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db/prisma-client.js'
import { getAdapter } from '../services/rcon-adapter.js'
import { generateSlug, uniqueSlug } from '../lib/slug.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns all servers that should receive commands for a given access list.
 * GLOBAL scope → all servers. SERVER/EXTERNAL scope → only linked servers.
 */
async function getTargetServers(listId: string, scope: string) {
  if (scope === 'GLOBAL') {
    return prisma.server.findMany()
  }
  const links = await prisma.serverListLink.findMany({
    where: { listId },
    include: { server: true },
  })
  return links.map((l) => l.server)
}

/**
 * Dispatch a command to all target servers for a list.
 * Errors are logged but do not abort — best-effort dispatch.
 */
async function dispatchToList(listId: string, scope: string, cmd: string, log: FastifyRequest['log']) {
  const servers = await getTargetServers(listId, scope)
  await Promise.allSettled(
    servers.map(async (server) => {
      try {
        const adapter = await getAdapter(server)
        await adapter.sendCommand(cmd)
      } catch (err) {
        log.error({ err, serverId: server.id }, `Failed to dispatch '${cmd}' to server ${server.id}`)
      }
    })
  )
}

// ── List CRUD ────────────────────────────────────────────────────────────────

export async function listAccessLists() {
  const lists = await prisma.accessList.findMany({
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return lists.map((l) => ({ ...l, entryCount: l._count.entries }))
}

export async function createAccessList(
  req: FastifyRequest<{
    Body: { name: string; type: string; scope?: string; description?: string; externalUrl?: string }
  }>,
  reply: FastifyReply
) {
  const { name, type, scope, description, externalUrl } = req.body

  const slug = await uniqueSlug(name, async (s) => {
    const existing = await prisma.accessList.findUnique({ where: { slug: s } })
    return !!existing
  })

  const list = await prisma.accessList.create({ data: { name, slug, type, scope, description, externalUrl } })

  await prisma.actionLog.create({
    data: {
      performedBy: req.session!.user.id,
      userId: req.session!.user.id,
      action: 'LIST_CREATE',
      details: JSON.stringify({ name, type, scope: scope ?? 'SERVER' }),
    },
  })

  reply.status(201)
  return list
}

export async function getAccessList(
  req: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({
    where: { slug: req.params.slug },
    include: { entries: { orderBy: { createdAt: 'desc' } } },
  })
  if (!list) return reply.status(404).send({ error: 'List not found' })

  // Enrich entries with player display names
  const steamIds = list.entries.map((e) => e.steamId)
  const players = steamIds.length > 0
    ? await prisma.player.findMany({
        where: { steamId: { in: steamIds } },
        select: { steamId: true, displayName: true },
      })
    : []
  const nameMap = new Map(players.map((p) => [p.steamId, p.displayName]))

  return {
    ...list,
    entries: list.entries.map((e) => ({
      ...e,
      displayName: nameMap.get(e.steamId) ?? null,
    })),
  }
}

export async function updateAccessList(
  req: FastifyRequest<{
    Params: { slug: string }
    Body: Partial<{ name: string; type: string; scope: string; description: string; externalUrl: string }>
  }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { slug: req.params.slug } })
  if (!list) return reply.status(404).send({ error: 'List not found' })
  const { name, type, scope, description, externalUrl } = req.body
  return prisma.accessList.update({
    where: { id: list.id },
    data: { name, type, scope, description, externalUrl },
  })
}

export async function deleteAccessList(
  req: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { slug: req.params.slug } })
  if (!list) return reply.status(404).send({ error: 'List not found' })
  const listName = list.name
  const listType = list.type
  await prisma.serverListLink.deleteMany({ where: { listId: list.id } })
  await prisma.listEntry.deleteMany({ where: { listId: list.id } })
  await prisma.accessList.delete({ where: { id: list.id } })

  await prisma.actionLog.create({
    data: {
      performedBy: req.session!.user.id,
      userId: req.session!.user.id,
      action: 'LIST_DELETE',
      details: JSON.stringify({ name: listName, type: listType }),
    },
  })

  return { ok: true }
}

// ── Entries ──────────────────────────────────────────────────────────────────

export async function upsertEntry(
  req: FastifyRequest<{
    Params: { slug: string }
    Body: {
      steamId: string
      playerName?: string
      reason?: string
      addedBy?: string
      permission?: string
      expiresAt?: string
    }
  }>
) {
  const list = await prisma.accessList.findUnique({ where: { slug: req.params.slug } })
  if (!list) return

  const { steamId, expiresAt, ...rest } = req.body
  const entry = await prisma.listEntry.upsert({
    where: { steamId_listId: { steamId, listId: list.id } },
    create: { steamId, listId: list.id, expiresAt: expiresAt ? new Date(expiresAt) : undefined, ...rest },
    update: { expiresAt: expiresAt ? new Date(expiresAt) : undefined, ...rest },
  })

  // Dispatch command to linked servers
  let cmd: string | null = null
  if (list.type === 'BAN')       cmd = `ban ${steamId}`
  if (list.type === 'WHITELIST') cmd = `whitelist ${steamId}`
  if (list.type === 'ADMIN')     cmd = `setpermissions ${steamId} ${rest.permission ?? 'client'}`

  if (cmd) {
    const servers = await getTargetServers(list.id, list.scope)
    await dispatchToList(list.id, list.scope, cmd, req.log)
    const action = list.type === 'BAN' ? 'BAN' : list.type === 'WHITELIST' ? 'WHITELIST' : 'SETPERMISSION'
    // Create one log per linked server so it appears in each server's activity feed
    if (servers.length > 0) {
      for (const server of servers) {
        await prisma.actionLog.create({
          data: {
            serverId: server.id,
            performedBy: req.session!.user.id,
            userId: req.session!.user.id,
            action,
            targetSteamId: steamId,
            details: JSON.stringify({ list: list.name, permission: rest.permission }),
          },
        })
      }
    } else {
      await prisma.actionLog.create({
        data: {
          performedBy: req.session!.user.id,
          userId: req.session!.user.id,
          action,
          targetSteamId: steamId,
          details: JSON.stringify({ list: list.name, permission: rest.permission }),
        },
      })
    }
  }

  return entry
}

export async function deleteEntry(
  req: FastifyRequest<{ Params: { slug: string; steamId: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { slug: req.params.slug } })
  if (!list) return reply.status(404).send({ error: 'List not found' })

  try {
    await prisma.listEntry.delete({
      where: { steamId_listId: { steamId: req.params.steamId, listId: list.id } },
    })
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'Entry not found' })
    throw err
  }

  // Dispatch reverse command
  let cmd: string | null = null
  if (list.type === 'BAN')       cmd = `unban ${req.params.steamId}`
  if (list.type === 'WHITELIST') cmd = `removewhitelist ${req.params.steamId}`
  if (list.type === 'ADMIN')     cmd = `removepermissions ${req.params.steamId}`

  if (cmd) {
    const servers = await getTargetServers(list.id, list.scope)
    await dispatchToList(list.id, list.scope, cmd, req.log)
    const action = list.type === 'BAN' ? 'UNBAN' : list.type === 'WHITELIST' ? 'REMOVEWHITELIST' : 'REMOVEPERMISSION'
    if (servers.length > 0) {
      for (const server of servers) {
        await prisma.actionLog.create({
          data: {
            serverId: server.id,
            performedBy: req.session!.user.id,
            userId: req.session!.user.id,
            action,
            targetSteamId: req.params.steamId,
            details: JSON.stringify({ list: list.name }),
          },
        })
      }
    } else {
      await prisma.actionLog.create({
        data: {
          performedBy: req.session!.user.id,
          userId: req.session!.user.id,
          action,
          targetSteamId: req.params.steamId,
          details: JSON.stringify({ list: list.name }),
        },
      })
    }
  }

  return { ok: true }
}

// ── Sync all entries to target servers ────────────────────────────────────────

export async function syncToServer(
  req: FastifyRequest<{ Params: { slug: string; serverName: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { slug: req.params.slug } })
  if (!list) return reply.status(404).send({ error: 'List not found' })

  const entries = await prisma.listEntry.findMany({ where: { listId: list.id } })
  if (entries.length === 0) return { ok: true, dispatched: 0, errors: 0, servers: 0 }

  const servers = await getTargetServers(list.id, list.scope)
  if (servers.length === 0) return { ok: true, dispatched: 0, errors: 0, servers: 0 }

  // Build commands for each entry
  const commands: string[] = []
  for (const entry of entries) {
    if (list.type === 'BAN')       commands.push(`ban ${entry.steamId}`)
    if (list.type === 'WHITELIST') commands.push(`whitelist ${entry.steamId}`)
    if (list.type === 'ADMIN')     commands.push(`setpermissions ${entry.steamId} ${entry.permission ?? 'client'}`)
  }

  // Dispatch to all target servers
  let dispatched = 0
  let errors = 0
  for (const server of servers) {
    try {
      const adapter = await getAdapter(server)
      const results = await Promise.allSettled(
        commands.map((cmd) => adapter.sendCommand(cmd))
      )
      dispatched += results.filter((r) => r.status === 'fulfilled').length
      errors += results.filter((r) => r.status === 'rejected').length
    } catch (err) {
      req.log.error({ err, serverId: server.id }, `Sync: failed to connect to server ${server.id}`)
      errors += commands.length
    }
  }

  // Log one SYNC action per server
  for (const server of servers) {
    await prisma.actionLog.create({
      data: {
        serverId: server.id,
        performedBy: req.session!.user.id,
        userId: req.session!.user.id,
        action: 'SYNC',
        details: JSON.stringify({ list: list.name, type: list.type, entries: entries.length }),
      },
    })
  }

  return { ok: true, dispatched, errors, servers: servers.length }
}

// ── External URL refresh (diff-based) ────────────────────────────────────────

export async function refreshExternal(
  req: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { slug: req.params.slug } })
  if (!list) return reply.status(404).send({ error: 'List not found' })
  if (list.scope !== 'EXTERNAL' || !list.externalUrl) {
    return reply.status(400).send({ error: 'List is not an EXTERNAL scope list with a URL' })
  }

  // SSRF protection
  let parsedUrl: URL
  try {
    parsedUrl = new URL(list.externalUrl)
  } catch {
    return reply.status(400).send({ error: 'Malformed external URL' })
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return reply.status(400).send({ error: 'External URL must use http or https' })
  }
  let resolvedAddress: string
  try {
    const { address } = await dns.lookup(parsedUrl.hostname)
    if (
      address === '0.0.0.0' || address === '::' ||
      /^127\./.test(address) || address === '::1' ||
      /^169\.254\./.test(address) || /^fe80:/i.test(address) ||
      /^10\./.test(address) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
      /^192\.168\./.test(address) ||
      /^::ffff:(?:127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i.test(address)
    ) {
      return reply.status(400).send({ error: 'URL not allowed' })
    }
    resolvedAddress = address
  } catch {
    return reply.status(400).send({ error: 'Failed to resolve external URL hostname' })
  }

  const fetchPort = parsedUrl.port
    ? parseInt(parsedUrl.port, 10)
    : parsedUrl.protocol === 'https:' ? 443 : 80
  const fetchPath = parsedUrl.pathname + (parsedUrl.search ?? '')
  const baseReqOpts = {
    hostname: resolvedAddress, port: fetchPort, path: fetchPath,
    method: 'GET' as const, headers: { Host: parsedUrl.hostname },
  }

  let text: string
  try {
    text = await new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      function handleResponse(res: http.IncomingMessage) {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          clearTimeout(timer); reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return
        }
        let totalBytes = 0
        const MAX_BYTES = 10 * 1024 * 1024
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          totalBytes += Buffer.byteLength(chunk, 'utf8')
          if (totalBytes > MAX_BYTES) { clearTimeout(timer); res.destroy(new Error('Response too large')); return }
          data += chunk
        })
        res.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
        res.on('end', () => { clearTimeout(timer); resolve(data) })
      }
      const httpReq = parsedUrl.protocol === 'https:'
        ? https.request({ ...baseReqOpts, servername: parsedUrl.hostname }, handleResponse)
        : http.request(baseReqOpts, handleResponse)
      httpReq.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
      httpReq.end()
      timer = setTimeout(() => { httpReq.destroy(); reject(new Error('Request timed out')) }, 10000)
    })
  } catch (err) {
    return reply.status(502).send({
      error: `Failed to fetch external URL: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const newIds = new Set(
    text.split('\n').map((l) => l.trim()).filter((l) => /^\d{17}$/.test(l))
  )

  if (newIds.size === 0) {
    req.log.warn({ url: list.externalUrl }, 'External ban list returned empty — skipping')
    return { ok: true, banned: 0, unbanned: 0, skipped: true, syncedAt: new Date() }
  }

  // Diff against current DB entries
  const existing = await prisma.listEntry.findMany({ where: { listId: list.id } })
  const existingIds = new Set(existing.map((e) => e.steamId))

  const toAdd    = [...newIds].filter((id) => !existingIds.has(id))
  const toRemove = [...existingIds].filter((id) => !newIds.has(id))

  const servers = await getTargetServers(list.id, list.scope)

  // Ban new entries
  for (const steamId of toAdd) {
    await prisma.listEntry.create({ data: { steamId, listId: list.id, addedBy: 'external-feed' } })
    for (const server of servers) {
      try {
        const adapter = await getAdapter(server)
        await adapter.sendCommand(`ban ${steamId}`)
      } catch (err) {
        req.log.error({ err }, `External sync: failed to ban ${steamId} on server ${server.id}`)
      }
    }
  }

  // Unban removed entries
  for (const steamId of toRemove) {
    await prisma.listEntry.deleteMany({ where: { steamId, listId: list.id } })
    for (const server of servers) {
      try {
        const adapter = await getAdapter(server)
        await adapter.sendCommand(`unban ${steamId}`)
      } catch (err) {
        req.log.error({ err }, `External sync: failed to unban ${steamId} on server ${server.id}`)
      }
    }
  }

  await prisma.accessList.update({ where: { id: list.id }, data: { syncedAt: new Date() } })

  return { ok: true, banned: toAdd.length, unbanned: toRemove.length, syncedAt: new Date() }
}

// ── Server-list assignments ──────────────────────────────────────────────────

export async function getAssignments(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  return prisma.serverListLink.findMany({
    where: { serverId: server.id },
    include: { list: true },
  })
}

export async function setAssignments(
  req: FastifyRequest<{ Params: { serverName: string }; Body: { listIds: string[] } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  const { listIds } = req.body
  await prisma.$transaction([
    prisma.serverListLink.deleteMany({ where: { serverId: server.id } }),
    prisma.serverListLink.createMany({ data: listIds.map((listId) => ({ serverId: server.id, listId })) }),
  ])
  return { ok: true }
}
