import prisma from '../db/prisma-client.js';
import { FileIOService } from './file-io.js';

// Push a single access list to a server's .txt file
export async function syncListToServer(listId: string, serverId: string): Promise<void> {
  const list = await prisma.accessList.findUniqueOrThrow({
    where: { id: listId },
    include: { entries: true },
  });
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  const io = new FileIOService(server.savePath);

  if (list.type === 'BAN') {
    await io.writeList('banlist.txt', list.entries.map(e => e.steamId));
  } else if (list.type === 'WHITELIST') {
    await io.writeList('whitelist.txt', list.entries.map(e => e.steamId));
  } else if (list.type === 'ADMIN') {
    // adminlist.txt format: SteamId:PermissionLevel
    await io.writeList('adminlist.txt', list.entries.map(e => `${e.steamId}:${e.permission ?? 'operator'}`));
  }
}

// Push all lists assigned to all servers
export async function syncAllLists(): Promise<void> {
  const links = await prisma.serverListLink.findMany();
  await Promise.all(links.map(l => syncListToServer(l.listId, l.serverId)));
}
