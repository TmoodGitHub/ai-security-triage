import Fastify from 'fastify';
import type { Pool } from 'pg';
import { registerFindingsRoutes } from './findings.js';

export function buildApp({
  db,
  logger = true,
}: {
  db: Pool;
  logger?: boolean;
}) {
  const app = Fastify({ logger });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  registerFindingsRoutes(app, db);

  return app;
}
