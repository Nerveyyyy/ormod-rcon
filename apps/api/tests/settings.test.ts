import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, mockDockerManager, type TestContext } from './helpers/setup.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let ctx: TestContext;
let serverId: string;
let savePath: string;

beforeAll(async () => {
  ctx = await setupTestContext();
  await mockDockerManager();

  // Create a temp directory to act as save path with a serversettings.json
  savePath = path.join(os.tmpdir(), `ormod-test-settings-${Date.now()}`);
  await fs.mkdir(savePath, { recursive: true });
  await fs.writeFile(
    path.join(savePath, 'serversettings.json'),
    JSON.stringify({ ServerName: 'TestServer', MaxPlayers: 20 }),
  );

  const res = await ctx.owner.post('/api/servers', {
    payload: JSON.stringify({
      name: 'Settings Test Server',
      serverName: 'settings-test-server',
      savePath,
    }),
  });
  serverId = JSON.parse(res.body).id;
});

afterAll(async () => {
  await ctx.cleanup();
  await fs.rm(savePath, { recursive: true, force: true }).catch(() => {});
});

describe('Settings routes', () => {
  describe('GET /api/servers/:id/settings', () => {
    it('any authenticated user can read settings', async () => {
      const res = await ctx.viewer.get(`/api/servers/${serverId}/settings`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ServerName).toBe('TestServer');
      expect(body.MaxPlayers).toBe(20);
    });

    it('unauthenticated → 401', async () => {
      const res = await ctx.unauthenticated.get(`/api/servers/${serverId}/settings`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /api/servers/:id/settings (replace)', () => {
    it('ADMIN can replace settings', async () => {
      const res = await ctx.admin.put(`/api/servers/${serverId}/settings`, {
        payload: JSON.stringify({ ServerName: 'UpdatedServer', MaxPlayers: 30 }),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);

      // Verify the settings were written
      const getRes = await ctx.admin.get(`/api/servers/${serverId}/settings`);
      const settings = JSON.parse(getRes.body);
      expect(settings.ServerName).toBe('UpdatedServer');
      expect(settings.MaxPlayers).toBe(30);
    });

    it('OWNER can replace settings', async () => {
      const res = await ctx.owner.put(`/api/servers/${serverId}/settings`, {
        payload: JSON.stringify({ ServerName: 'OwnerServer', MaxPlayers: 40 }),
      });
      expect(res.statusCode).toBe(200);
    });

    it('VIEWER cannot replace settings → 403', async () => {
      const res = await ctx.viewer.put(`/api/servers/${serverId}/settings`, {
        payload: JSON.stringify({ ServerName: 'ViewerServer' }),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/servers/:id/settings/:key (update single key)', () => {
    it('ADMIN can update a single setting key', async () => {
      const res = await ctx.admin.put(`/api/servers/${serverId}/settings/MaxPlayers`, {
        payload: JSON.stringify({ value: 50 }),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.key).toBe('MaxPlayers');
      expect(body.value).toBe(50);
    });

    it('VIEWER cannot update a single key → 403', async () => {
      const res = await ctx.viewer.put(`/api/servers/${serverId}/settings/MaxPlayers`, {
        payload: JSON.stringify({ value: 99 }),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
