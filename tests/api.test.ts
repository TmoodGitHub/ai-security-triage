import pg from 'pg';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
import { buildApp } from '../src/api/app.js';
import { authHeaders, verify } from './helpers.js';

const db = new pg.Pool();
const app = buildApp({ db, verify, logger: false });
let headers: { authorization: string };

beforeAll(async () => {
  headers = await authHeaders();
});

afterAll(async () => {
  await app.close();
  await db.end();
});

describe('authentication', () => {
  it('allows the health check without a token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('rejects a request with no token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Missing bearer token',
    });
  });

  it('rejects a request with an invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings',
      headers: { authorization: 'Bearer not-a-real-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Invalid or expired token',
    });
  });
});

describe('GET /me', () => {
  it('returns who the token belongs to', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      subject: 'test-analyst',
      name: null,
    });
  });
});

describe('request validation', () => {
  it('rejects an invalid severity filter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings?severity=severe',
      headers,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a finding id that is not a number', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings/abc',
      headers,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a review with an invalid decision', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      headers,
      payload: {
        decision: 'maybe',
        classification: 'true_positive',
        note: 'Unsure',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a review with no decision', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      headers,
      payload: {
        classification: 'true_positive',
        note: 'Looks fine',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a review with no classification', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      headers,
      payload: {
        decision: 'approved',
        note: 'Looks fine',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a review with an invalid classification', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      headers,
      payload: {
        decision: 'approved',
        classification: 'misc',
        note: 'Looks fine',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a review with no note', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      headers,
      payload: {
        decision: 'approved',
        classification: 'true_positive',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a review whose note is only spaces', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/1/review',
      headers,
      payload: {
        decision: 'approved',
        classification: 'true_positive',
        note: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
