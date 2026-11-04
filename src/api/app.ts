import Fastify, { type FastifyError } from 'fastify';
import type { Db } from '../db/types.js';
import type { AuthUser, Verifier } from '../auth/tokens.js';
import { registerFindingsRoutes } from './findings.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

const PUBLIC_ROUTES = new Set(['/health']);

export function buildApp({
  db,
  verify,
  logger = true,
}: {
  db: Db;
  verify: Verifier;
  logger?: boolean;
}) {
  const app = Fastify({ logger });

  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request, reply) => {
    if (PUBLIC_ROUTES.has(request.routeOptions.url ?? '')) {
      return;
    }

    const header = request.headers.authorization;
    if (
      header === undefined ||
      !header.startsWith('Bearer ')
    ) {
      return reply
        .code(401)
        .send({ error: 'Missing bearer token' });
    }

    try {
      request.user = await verify(
        header.slice('Bearer '.length),
      );
    } catch {
      return reply
        .code(401)
        .send({ error: 'Invalid or expired token' });
    }
  });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  app.get('/me', async (request) => {
    return request.user;
  });

  app.setErrorHandler<FastifyError>(
    (error, request, reply) => {
      if (error.name === 'DatabaseResumingException') {
        return reply
          .code(503)
          .header('Retry-After', '5')
          .send({
            error:
              'The database is waking up. Try again in a few seconds.',
            code: 'database_resuming',
          });
      }
      if ((error.statusCode ?? 500) >= 500) {
        request.log.error(error);
      }
      return reply.send(error);
    },
  );

  registerFindingsRoutes(app, db);

  return app;
}
