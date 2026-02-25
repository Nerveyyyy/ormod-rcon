import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, type TestContext } from './helpers/setup.js';

let ctx: TestContext;

beforeAll(async () => { ctx = await setupTestContext(); });
afterAll(async () => { await ctx.cleanup(); });

describe('Setup endpoint', () => {
  it('GET /api/setup returns setupRequired: false when users exist', async () => {
    // Our test context already created users, so setup should not be required
    const res = await ctx.unauthenticated.get('/api/setup');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.setupRequired).toBe(false);
  });

  it('POST /api/setup when owner exists → 403', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'Another Owner',
        email: 'another@test.com',
        password: 'password123',
      }),
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Setup already complete');
  });

  it('POST /api/setup validates request body', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: '', email: 'bad' }),
    });
    // Schema validation should fail (400) before the controller runs
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/setup is public (no auth required)', async () => {
    const res = await ctx.unauthenticated.get('/api/setup');
    expect(res.statusCode).toBe(200);
  });
});
