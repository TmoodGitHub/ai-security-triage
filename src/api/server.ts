import { buildApp } from './app.js';
import { db } from '../db/client.js';
import { createVerifier } from '../auth/tokens.js';

const secret = process.env.JWT_SECRET;
if (secret === undefined || secret.length < 32) {
  console.error(
    'JWT_SECRET must be set in .env and be at least 32 characters',
  );
  process.exit(1);
}

const port = Number(process.env.API_PORT ?? 3000);
const app = buildApp({
  db,
  verify: createVerifier(secret),
});

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
