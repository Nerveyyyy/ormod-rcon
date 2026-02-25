/**
 * Test helper — builds an isolated Fastify app with per-file SQLite DB.
 *
 * Usage:
 *   const ctx = await setupTestContext();
 *   // ctx.owner.get('/api/servers')  — authenticated GET as OWNER
 *   // ctx.admin.post('/api/lists', { body: {...} }) — authenticated POST as ADMIN
 *   // ctx.viewer.delete('/api/lists/1') — authenticated DELETE as VIEWER (should 403)
 *   // ctx.unauthenticated.get('/api/servers') — no auth cookies
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '../..');
const TEST_DB_DIR = path.join(API_ROOT, '.test-dbs');

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface AuthenticatedUser {
  cookies: string;
  csrfToken: string;
  get: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
  post: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
  put: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
  delete: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
}

interface UnauthenticatedClient {
  get: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
  post: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
  put: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
  delete: (url: string, opts?: Partial<InjectOptions>) => ReturnType<FastifyInstance['inject']>;
}

export interface TestContext {
  app: FastifyInstance;
  owner: AuthenticatedUser;
  admin: AuthenticatedUser;
  viewer: AuthenticatedUser;
  unauthenticated: UnauthenticatedClient;
  cleanup: () => Promise<void>;
}

function extractCookies(res: { headers: Record<string, string | string[] | undefined> }): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(c => c.split(';')[0]!);
}

function mergeCookies(existing: string, newCookies: string[]): string {
  const map = new Map<string, string>();
  // Parse existing
  for (const part of existing.split('; ').filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq > 0) map.set(part.slice(0, eq), part);
  }
  // Override with new
  for (const c of newCookies) {
    const eq = c.indexOf('=');
    if (eq > 0) map.set(c.slice(0, eq), c);
  }
  return [...map.values()].join('; ');
}

function makeRequestHelper(
  app: FastifyInstance,
  getCookies: () => string,
  setCookies: (c: string) => void,
  getCsrf: () => string,
) {
  return (method: RequestMethod) => (url: string, opts?: Partial<InjectOptions>) => {
    const isWrite = method !== 'GET';
    const userHeaders = (opts?.headers as Record<string, string>) ?? {};
    const headers: Record<string, string> = {
      cookie: getCookies(),
      ...(isWrite ? { 'x-csrf-token': getCsrf() } : {}),
      ...userHeaders,
    };

    const payload = opts?.payload ?? opts?.body;

    // Default to JSON content type for write requests with a payload
    if (isWrite && payload && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    const injectOpts: InjectOptions = {
      method,
      url,
      ...opts,
      headers,
      payload,
    };

    return app.inject(injectOpts).then(res => {
      // Update cookies from response
      const newCookies = extractCookies(res);
      if (newCookies.length > 0) {
        setCookies(mergeCookies(getCookies(), newCookies));
      }
      return res;
    });
  };
}

function buildClient(
  app: FastifyInstance,
  initialCookies: string,
  initialCsrf: string,
): AuthenticatedUser {
  let cookies = initialCookies;
  let csrfToken = initialCsrf;
  const helper = makeRequestHelper(
    app,
    () => cookies,
    (c) => { cookies = c; },
    () => csrfToken,
  );

  return {
    get cookies() { return cookies; },
    get csrfToken() { return csrfToken; },
    get: helper('GET'),
    post: helper('POST'),
    put: helper('PUT'),
    delete: helper('DELETE'),
  };
}

function buildUnauthenticatedClient(app: FastifyInstance): UnauthenticatedClient {
  const helper = makeRequestHelper(
    app,
    () => '',
    () => {},
    () => '',
  );
  return {
    get: helper('GET'),
    post: helper('POST'),
    put: helper('PUT'),
    delete: helper('DELETE'),
  };
}

export async function setupTestContext(): Promise<TestContext> {
  // 1. Create isolated SQLite DB
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }
  const dbName = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`;
  const dbPath = path.join(TEST_DB_DIR, dbName);
  const dbUrl = `file:${dbPath}`;

  // 2. Set env vars before any module loads that reads them
  process.env.DATABASE_URL = dbUrl;
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-auth';
  process.env.DOCKER_CONTROL_ENABLED = 'true';
  process.env.DOCKER_SOCKET = '/var/run/docker.sock';
  process.env.GAME_CONTAINER_NAME = 'test-game';
  process.env.SAVES_PATH = '';
  process.env.SAVE_BASE_PATH = '';
  process.env.BACKUP_PATH = './test-backups';

  // 3. Push schema to DB (creates tables without migrations)
  const schemaPath = path.join(API_ROOT, 'prisma', 'schema.prisma');
  execSync(`npx prisma db push --accept-data-loss`, {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  // 4. Build app — dynamic import to pick up env vars
  // Clear module cache for prisma-client so it connects to our test DB
  const buildApp = (await import('../../src/app.js')).default;
  const app = await buildApp({ logger: false });
  await app.ready();

  // 5. Create test users via the setup endpoint and BetterAuth sign-up
  const users = [
    { name: 'Owner', email: 'owner@test.com', password: 'password123', role: 'OWNER' },
    { name: 'Admin', email: 'admin@test.com', password: 'password123', role: 'ADMIN' },
    { name: 'Viewer', email: 'viewer@test.com', password: 'password123', role: 'VIEWER' },
  ];

  const authenticatedUsers: AuthenticatedUser[] = [];

  for (const u of users) {
    // Sign up via BetterAuth endpoint
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: u.name, email: u.email, password: u.password }),
    });

    // BetterAuth hijacks the reply, so we need to work with what we get
    // The user is created in the DB at this point

    // Update role in DB
    const dbUser = await app.prisma.user.findUnique({ where: { email: u.email } });
    if (dbUser) {
      await app.prisma.user.update({
        where: { id: dbUser.id },
        data: { role: u.role },
      });
    }

    // Sign in to get session cookies
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email: u.email, password: u.password }),
    });

    const cookies = extractCookies(signInRes).join('; ');

    // Fetch CSRF token
    const csrfRes = await app.inject({
      method: 'GET',
      url: '/api/csrf-token',
      headers: { cookie: cookies },
    });

    const csrfCookies = extractCookies(csrfRes);
    const allCookies = mergeCookies(cookies, csrfCookies);

    let csrfToken = '';
    try {
      const csrfBody = JSON.parse(csrfRes.body);
      csrfToken = csrfBody.token ?? '';
    } catch {
      // CSRF endpoint may not return JSON if something went wrong
    }

    authenticatedUsers.push(buildClient(app, allCookies, csrfToken));
  }

  const cleanup = async () => {
    await app.close();
    // Clean up DB file
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + '-journal'); } catch {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}
  };

  return {
    app,
    owner: authenticatedUsers[0]!,
    admin: authenticatedUsers[1]!,
    viewer: authenticatedUsers[2]!,
    unauthenticated: buildUnauthenticatedClient(app),
    cleanup,
  };
}

/**
 * Monkey-patches the dockerManager singleton with vi.fn() stubs so tests
 * don't hit the real Docker socket. Call this in beforeAll AFTER setupTestContext.
 *
 * Uses a file:// URL import to ensure we get the same module instance that
 * @fastify/autoload loaded for the controllers (both resolve through tsx).
 */
export async function mockDockerManager(opts?: { isRunning?: boolean }) {
  // Import using file:// URL — this goes through the same tsx loader that
  // @fastify/autoload used, ensuring we get the same module singleton.
  const modulePath = path.resolve(API_ROOT, 'src/services/docker-manager.ts');
  const fileUrl = 'file:///' + modulePath.replace(/\\/g, '/');
  const mod = await import(/* @vite-ignore */ fileUrl);
  const dm = mod.dockerManager as Record<string, unknown>;

  dm.start = vi.fn().mockResolvedValue(undefined);
  dm.stop = vi.fn().mockResolvedValue(undefined);
  dm.restart = vi.fn().mockResolvedValue(undefined);
  dm.sendCommand = vi.fn().mockResolvedValue(undefined);
  dm.isRunning = vi.fn().mockReturnValue(opts?.isRunning ?? false);
  dm.getOutputBuffer = vi.fn().mockReturnValue(opts?.isRunning ? ['line1', 'line2'] : []);
  dm.getOutputEmitter = vi.fn().mockReturnValue(undefined);
  dm.reconnect = vi.fn().mockResolvedValue(undefined);
  dm.inspect = vi.fn().mockResolvedValue({ running: opts?.isRunning ?? false, tty: true });

  return dm;
}
