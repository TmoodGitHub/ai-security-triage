import { buildApp } from './app.js';

const port = Number(process.env.API_PORT ?? 3000);
const app = buildApp();

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
