import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/api/app.js';

describe('API', () => {
  it('responds to the health check', async () => {
    const app = buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
