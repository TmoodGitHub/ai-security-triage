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

  it('rejects a review with an invalid decision', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      payload: {
        decision: 'maybe',
        classification: 'true_positive',
        note: 'Unsure',
      },
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });

  it('rejects a review with no decision', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      payload: {
        classification: 'true_positive',
        note: 'looks fine',
      },
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });

  it('rejects a review with no classification', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'POST',
      url: 'findings/1/review',
      payload: { decision: 'approved', note: 'Looks fine' },
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });

  it('reject a review with an invalid classification', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'POST',
      url: 'findings/1/review',
      payload: {
        decision: 'approved',
        classification: 'misc',
        note: 'Looks fine',
      },
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });

  it('rejects a review with no note', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      payload: {
        decision: 'approved',
        classification: 'true_positive',
      },
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });

  it('rejects a review whose note is only spaces', async () => {
    const db = new pg.Pool();
    const app = buildApp({ db, logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      payload: {
        decision: 'approved',
        classification: 'true_positive',
        note: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
    await db.end();
  });
});
