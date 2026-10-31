import { readdir, readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  ExecuteStatementCommand,
  RDSDataClient,
} from '@aws-sdk/client-rds-data';

const MIGRATIONS_DIR = 'db/migrations';
const RESUME_RETRY_MS = 5_000;
const RESUME_MAX_ATTEMPTS = 12;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const resourceArn = requireEnv('DB_CLUSTER_ARN');
const secretArn = requireEnv('DB_SECRET_ARN');
const database = process.argv[2] ?? requireEnv('DB_NAME');
const client = new RDSDataClient({});

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function execute(sql: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.send(
        new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql,
        }),
      );
      return;
    } catch (error) {
      const resuming =
        error instanceof Error &&
        error.name === 'DatabaseResumingException';
      if (!resuming || attempt >= RESUME_MAX_ATTEMPTS)
        throw error;
      console.log(
        'Database is resuming, retrying in 5 seconds...',
      );
      await sleep(RESUME_RETRY_MS);
    }
  }
}

const files = (await readdir(MIGRATIONS_DIR))
  .filter((file) => file.endsWith('.sql'))
  .sort();

for (const file of files) {
  const sql = await readFile(
    `${MIGRATIONS_DIR}/${file}`,
    'utf8',
  );
  for (const statement of splitStatements(sql)) {
    await execute(statement);
  }
  console.log(`Applied ${file}`);
}
