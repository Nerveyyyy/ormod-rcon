import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js';

let ctx: TestContext;
let serverId: string;

beforeAll(async () => {
  ctx = await setupTestContext();
  // Mock docker as "running" so console commands can be dispatched
  await mockDockerManager({ isRunning: true });
  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Console Test Server',
      serverName: 'console-test-server',
      savePath: '/tmp/console-test',
    }),
  });
  serverId = JSON.parse(res.body).id;
});
afterAll(async () => { await ctx.cleanup(); });

describe('Console routes', () => {
  describe('POST /api/servers/:id/console/command', () => {
    // Docker socket is not available in tests. These tests verify the RBAC
    // layer only: ADMIN+ passes the auth guard (not 403), VIEWER is rejected.
    // The actual Docker call may fail with 400/500 — that's expected without Docker.

    it('ADMIN passes RBAC for send command (not 403)', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverId}/console/command`, {
        payload: JSON.stringify({ command: 'status' }),
      });
      expect(res.statusCode).not.toBe(403);
    });

    it('OWNER passes RBAC for send command (not 403)', async () => {
      const res = await ctx.owner.post(`/api/servers/${serverId}/console/command`, {
        payload: JSON.stringify({ command: 'help' }),
      });
      expect(res.statusCode).not.toBe(403);
    });

    it('VIEWER cannot send a command → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverId}/console/command`, {
        payload: JSON.stringify({ command: 'status' }),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/servers/:id/console/log', () => {
    it('any authenticated user can read console log', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}/console/log`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('lines');
      expect(Array.isArray(body.lines)).toBe(true);
    });

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverId}/console/log`);
      expect(res.statusCode).toBe(401);
    });
  });
});
