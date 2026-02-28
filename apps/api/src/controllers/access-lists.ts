import http from 'node:http'
import https from 'node:https'
import type { FastifyRequest, FastifyReply } from 'fastify'
import dns from 'node:dns/promises'
import prisma from '../db/prisma-client.js'
import { syncListToServer, syncAllLists } from '../services/list-service.js'

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
  const list = await prisma.accessList.create({ data: req.body })
  reply.status(201)
  return list
}

export async function getAccessList(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({
    where: { id: req.params.id },
    include: { entries: { orderBy: { createdAt: 'desc' } } },
  })
  if (!list) return reply.status(404).send({ error: 'List not found' })
  return list
}

export async function updateAccessList(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { id: req.params.id } })
  if (!list) return reply.status(404).send({ error: 'List not found' })
  return prisma.accessList.update({ where: { id: req.params.id }, data: req.body })
}

export async function deleteAccessList(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { id: req.params.id } })
  if (!list) return reply.status(404).send({ error: 'List not found' })
  await prisma.accessList.delete({ where: { id: req.params.id } })
  return { ok: true }
}

// ── Entries ──────────────────────────────────────────────────────────────────

export async function upsertEntry(
  req: FastifyRequest<{
    Params: { id: string }
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
  const { steamId, expiresAt, ...rest } = req.body
  return prisma.listEntry.upsert({
    where: { steamId_listId: { steamId, listId: req.params.id } },
    create: {
      steamId,
      listId: req.params.id,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      ...rest,
    },
    update: { expiresAt: expiresAt ? new Date(expiresAt) : undefined, ...rest },
  })
}

export async function deleteEntry(
  req: FastifyRequest<{ Params: { id: string; steamId: string } }>,
  reply: FastifyReply
) {
  try {
    await prisma.listEntry.delete({
      where: { steamId_listId: { steamId: req.params.steamId, listId: req.params.id } },
    })
    return { ok: true }
  } catch {
    return reply.status(404).send({ error: 'Entry not found' })
  }
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export async function syncListToSingleServer(
  req: FastifyRequest<{ Params: { id: string; serverId: string } }>,
  reply: FastifyReply
) {
  try {
    await syncListToServer(req.params.id, req.params.serverId)
    return { ok: true, syncedAt: new Date().toISOString() }
  } catch (err) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) })
  }
}

export async function syncAll(_req: FastifyRequest, reply: FastifyReply) {
  try {
    await syncAllLists()
    return { ok: true }
  } catch (err) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) })
  }
}

// ── External URL refresh ─────────────────────────────────────────────────────

export async function refreshExternal(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const list = await prisma.accessList.findUnique({ where: { id: req.params.id } })
  if (!list) return reply.status(404).send({ error: 'List not found' })
  if (list.scope !== 'EXTERNAL' || !list.externalUrl) {
    return reply.status(400).send({ error: 'List is not an EXTERNAL scope list with a URL' })
  }

  // SSRF protection: validate URL scheme and resolve hostname to reject private/loopback ranges
  let parsedUrl: URL
  try {
    parsedUrl = new URL(list.externalUrl)
  } catch {
    return reply.status(400).send({ error: 'Malformed external URL' })
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return reply.status(400).send({ error: 'External URL must use http or https' })
  }
  // Resolve once and keep the IP for the actual request (prevents DNS rebinding / TOCTOU)
  let resolvedAddress: string
  try {
    const { address } = await dns.lookup(parsedUrl.hostname)
    // Reject loopback, link-local, RFC-1918 private ranges, IPv4-mapped IPv6,
    // and unspecified addresses (0.0.0.0 / ::)
    if (
      address === '0.0.0.0' ||
      address === '::' ||
      /^127\./.test(address) ||
      address === '::1' ||
      /^169\.254\./.test(address) ||
      /^fe80:/i.test(address) ||
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

  // Connect to the already-resolved IP to prevent DNS rebinding.
  // For HTTPS, servername carries the original hostname for SNI + cert validation.
  const fetchPort = parsedUrl.port
    ? parseInt(parsedUrl.port, 10)
    : parsedUrl.protocol === 'https:'
      ? 443
      : 80
  const fetchPath = parsedUrl.pathname + (parsedUrl.search ?? '')
  const baseReqOpts = {
    hostname: resolvedAddress,
    port: fetchPort,
    path: fetchPath,
    method: 'GET' as const,
    headers: { Host: parsedUrl.hostname },
  }

  let text: string
  try {
    text = await new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line prefer-const -- assigned after handleResponse is defined (forward-reference closure)
      let timer: ReturnType<typeof setTimeout> | undefined
      function handleResponse(res: http.IncomingMessage) {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          clearTimeout(timer)
          reject(new Error(`HTTP ${res.statusCode}`))
          res.resume()
          return
        }
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          data += chunk
        })
        res.on('end', () => {
          clearTimeout(timer)
          resolve(data)
        })
      }
      const httpReq =
        parsedUrl.protocol === 'https:'
          ? https.request({ ...baseReqOpts, servername: parsedUrl.hostname }, handleResponse)
          : http.request(baseReqOpts, handleResponse)
      httpReq.on('error', (err: Error) => {
        clearTimeout(timer)
        reject(err)
      })
      httpReq.end()
      timer = setTimeout(() => {
        httpReq.destroy()
        reject(new Error('Request timed out'))
      }, 10000)
    })
  } catch (err) {
    return reply.status(502).send({
      error: `Failed to fetch external URL: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const steamIds = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d{17}$/.test(l))

  await prisma.$transaction([
    prisma.listEntry.deleteMany({ where: { listId: list.id } }),
    prisma.listEntry.createMany({
      data: steamIds.map((steamId) => ({ steamId, listId: list.id, addedBy: 'external-feed' })),
    }),
    prisma.accessList.update({
      where: { id: list.id },
      data: { syncedAt: new Date() },
    }),
  ])

  return { ok: true, imported: steamIds.length, syncedAt: new Date() }
}

// ── Server-list assignments ──────────────────────────────────────────────────

export async function getAssignments(req: FastifyRequest<{ Params: { id: string } }>) {
  return prisma.serverListLink.findMany({
    where: { serverId: req.params.id },
    include: { list: true },
  })
}

export async function setAssignments(
  req: FastifyRequest<{ Params: { id: string }; Body: { listIds: string[] } }>
) {
  const { id: serverId } = req.params
  const { listIds } = req.body
  await prisma.$transaction([
    prisma.serverListLink.deleteMany({ where: { serverId } }),
    prisma.serverListLink.createMany({
      data: listIds.map((listId) => ({ serverId, listId })),
    }),
  ])
  return { ok: true }
}
