import pg from 'pg';
import { createDataApiDb } from './data-api.js';
import { createPgDb } from './pg.js';
import type { Db } from './types.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }
  return value;
}

function createDb(): Db {
  const driver = process.env.DB_DRIVER ?? 'pg';

  if (driver === 'pg') {
    return createPgDb(
      new pg.Pool({
        host: requireEnv('DB_HOST'),
        port: Number(requireEnv('DB_PORT')),
        user: requireEnv('POSTGRES_USER'),
        password: requireEnv('POSTGRES_PASSWORD'),
        database: requireEnv('POSTGRES_DB'),
      }),
    );
  }

  if (driver === 'data-api') {
    return createDataApiDb({
      resourceArn: requireEnv('DB_CLUSTER_ARN'),
      secretArn: requireEnv('DB_SECRET_ARN'),
      database: requireEnv('DB_NAME'),
    });
  }

  throw new Error(
    `DB_DRIVER must be "pg" or "data-api", got "${driver}"`,
  );
}

export const db = createDb();

export function databaseName(): string | undefined {
  return process.env.DB_DRIVER === 'data-api'
    ? process.env.DB_NAME
    : process.env.POSTGRES_DB;
}
