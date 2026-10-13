import Fastify from 'fastify';

export function buildApp({
  logger = true,
}: { logger?: boolean } = {}) {
  const app = Fastify({ logger });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
