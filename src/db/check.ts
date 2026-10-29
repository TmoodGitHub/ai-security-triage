import { db } from './client.js';

const result = await db.query<{ count: string }>(
  'SELECT COUNT(*) AS count FROM events',
);
console.log(
  `Connected. The events table has ${result.rows[0]?.count} rows.`,
);
await db.end();
