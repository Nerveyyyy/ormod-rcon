import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js';

let ctx: TestContext;
let serverId: string;

beforeAll(async () => {
  ctx = await setupTestContext();
  await mockDockerManager();
  // Create a server for wipe tests
  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Wipe Test Server',
      serverName: 'wipe-test-server',
      savePath: '/tmp/wipe-test',
    }),
  });
  serverId = JSON.parse(res.body).id;
});
afterAll(async () => { await ctx.cleanup(); });

describe('Wipe routes', () => {
  describe('GET /api/servers/:id/wipes', () => {
    it('any authenticated user can list wipes', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}/wipes`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverId}/wipes`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/servers/:id/wipe', () => {
    it('OWNER can execute a wipe', async () => {
      const res = await ctx.owner.post(`/api/servers/${serverId}/wipe`, {
        payload: JSON.stringify({
          type: 'MAP_ONLY',
          backup: false,
          stopFirst: false,
        }),
      });
      // May succeed or 500 from the wipe service trying to access filesystem,
      // but should NOT be 403 (that's the RBAC check we care about)
      expect(res.statusCode).not.toBe(403);
    });

    it('ADMIN cannot execute a wipe → 403', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverId}/wipe`, {
        payload: JSON.stringify({
          type: 'MAP_ONLY',
          backup: false,
          stopFirst: false,
        }),
      });
      expect(res.statusCode).toBe(403);
    });

    it('VIEWER cannot execute a wipe → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverId}/wipe`, {
        payload: JSON.stringify({
          type: 'MAP_ONLY',
          backup: false,
          stopFirst: false,
        }),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
