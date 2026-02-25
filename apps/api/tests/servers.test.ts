import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestContext();
  await mockDockerManager();
});
afterAll(async () => { await ctx.cleanup(); });

const serverData = {
  name: 'Test Server',
  serverName: 'test-server-1',
  savePath: '/tmp/test-saves',
};

describe('Servers routes', () => {
  let serverId: string;

  describe('POST /api/servers (create)', () => {
    it('OWNER can create a server', async () => {
      const res = await ctx.owner.post('/api/servers', {
        payload: JSON.stringify(serverData),
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe(serverData.name);
      expect(body.serverName).toBe(serverData.serverName);
      serverId = body.id;
    });

    it('ADMIN cannot create a server → 403', async () => {
      const res = await ctx.admin.post('/api/servers', {
        payload: JSON.stringify({
          name: 'Admin Server',
          serverName: 'admin-server',
          savePath: '/tmp/admin-saves',
        }),
      });
      expect(res.statusCode).toBe(403);
    });

    it('VIEWER cannot create a server → 403', async () => {
      const res = await ctx.viewer.post('/api/servers', {
        payload: JSON.stringify({
          name: 'Viewer Server',
          serverName: 'viewer-server',
          savePath: '/tmp/viewer-saves',
        }),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/servers', () => {
    it('any authenticated user can list servers', async () => {
      const res = await ctx.viewer.get('/api/servers');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/servers/:id', () => {
    it('returns server details', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(serverId);
      expect(body.name).toBe(serverData.name);
    });

    it('returns 404 for nonexistent server', async () => {
      const res = await ctx.viewer.get('/api/servers/nonexistent-id');
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/servers/:id (update)', () => {
    it('ADMIN can update a server', async () => {
      const res = await ctx.admin.put(`/api/servers/${serverId}`, {
        payload: JSON.stringify({ name: 'Updated Server' }),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('Updated Server');
    });

    it('OWNER can update a server', async () => {
      const res = await ctx.owner.put(`/api/servers/${serverId}`, {
        payload: JSON.stringify({ name: 'Owner Updated' }),
      });
      expect(res.statusCode).toBe(200);
    });

    it('VIEWER cannot update a server → 403', async () => {
      const res = await ctx.viewer.put(`/api/servers/${serverId}`, {
        payload: JSON.stringify({ name: 'Viewer Updated' }),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/servers/:id/start|stop|restart (RBAC)', () => {
    // Docker socket is not available in tests. These tests verify the RBAC
    // layer only: ADMIN+ passes the auth guard (not 403), VIEWER is rejected.
    // The actual Docker call may fail with 500 — that's expected without Docker.

    it('ADMIN passes RBAC for start (not 403)', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverId}/start`);
      expect(res.statusCode).not.toBe(403);
    });

    it('ADMIN passes RBAC for stop (not 403)', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverId}/stop`);
      expect(res.statusCode).not.toBe(403);
    });

    it('ADMIN passes RBAC for restart (not 403)', async () => {
      const res = await ctx.admin.post(`/api/servers/${serverId}/restart`);
      expect(res.statusCode).not.toBe(403);
    });

    it('VIEWER cannot start a server → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverId}/start`);
      expect(res.statusCode).toBe(403);
    });

    it('VIEWER cannot stop a server → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverId}/stop`);
      expect(res.statusCode).toBe(403);
    });

    it('VIEWER cannot restart a server → 403', async () => {
      const res = await ctx.viewer.post(`/api/servers/${serverId}/restart`);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/servers/:id', () => {
    it('ADMIN cannot delete a server → 403', async () => {
      const res = await ctx.admin.delete(`/api/servers/${serverId}`);
      expect(res.statusCode).toBe(403);
    });

    it('VIEWER cannot delete a server → 403', async () => {
      const res = await ctx.viewer.delete(`/api/servers/${serverId}`);
      expect(res.statusCode).toBe(403);
    });

    it('OWNER can delete a server', async () => {
      const res = await ctx.owner.delete(`/api/servers/${serverId}`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });
  });
});
