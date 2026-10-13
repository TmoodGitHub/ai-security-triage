import pg from 'pg';
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/api/app.js';

describe('API', () => {
  it('responds to the health check', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await db.end();
  });

  it('rejects an invalid severity filter', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/findings?severity=severe',
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });

  it('rejects a finding id that is not a number', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/findings/abc',
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });
});
