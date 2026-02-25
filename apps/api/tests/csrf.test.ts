import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, type TestContext } from './helpers/setup.js';

let ctx: TestContext;

beforeAll(async () => { ctx = await setupTestContext(); });
afterAll(async () => { await ctx.cleanup(); });

describe('CSRF protection', () => {
  it('GET /api/csrf-token returns a token', async () => {
    const res = await ctx.owner.get('/api/csrf-token');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeTypeOf('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  it('POST without CSRF token is rejected with 403', async () => {
    // Make a POST request without the CSRF token header
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: {
        cookie: ctx.owner.cookies,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ name: 'Test', serverName: 'csrf-test', savePath: '/tmp' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST with valid CSRF token passes validation', async () => {
    // The owner client automatically includes CSRF token
    const res = await ctx.owner.post('/api/lists', {
      payload: JSON.stringify({ name: 'CSRF Test List', type: 'BAN' }),
    });
    // Should not be 403 (CSRF rejected) — may be 201 (created) or other non-CSRF error
    expect(res.statusCode).not.toBe(403);
  });

  it('POST /api/setup skips CSRF validation', async () => {
    // Setup endpoint should work without CSRF token (first-run scenario)
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'New Owner',
        email: 'newowner@test.com',
        password: 'password123',
      }),
    });
    // Should NOT be 403 (CSRF). Will be 403 because setup already done (owner exists),
    // but that's the controller's 403, not CSRF's 403.
    const body = JSON.parse(res.body);
    // CSRF 403 says "Invalid csrf token" — setup's 403 says "Setup already complete"
    if (res.statusCode === 403) {
      expect(body.error).toContain('Setup already complete');
    }
  });
});
