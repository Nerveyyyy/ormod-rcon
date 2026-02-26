import { PrismaClient } from '../../prisma/generated/client.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

let _prisma: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (!_prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  }
  return _prisma;
}

// Proxy so all existing importers work unchanged.
// Defers adapter/client creation until the first property access,
// ensuring DATABASE_URL is available regardless of module-eval order.
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as any)[prop as string];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;
