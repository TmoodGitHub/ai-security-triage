import { readFileSync } from 'node:fs';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from 'vitest';
import { ingestCloudTrail } from '../../src/ingest/ingest.js';
import { saveEvents } from '../../src/db/events.js';
import { pool } from '../../src/db/client.js';

const samplePath = new URL(
  '../../samples/cloudtrail_sample.json',
  import.meta.url,
);
const events = ingestCloudTrail(
  readFileSync(samplePath, 'utf8'),
);

async function countRows(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM events',
  );
  return Number(result.rows[0]?.count);
}

describe('saveEvents (needs the database running)', () => {
  beforeAll(() => {
    if (!process.env.POSTGRES_DB?.endsWith('_test')) {
      throw new Error(
        'Refusing to run: these tests delete data and must use a *_test database',
      );
    }
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE events');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('saves every event', async () => {
    const saved = await saveEvents(events);

    expect(saved).toBe(5);
    expect(await countRows()).toBe(5);
  });

  it('skips events that are already saved', async () => {
    await saveEvents(events);
    const savedAgain = await saveEvents(events);

    expect(savedAgain).toBe(0);
    expect(await countRows()).toBe(5);
  });

  it('stores the values in the right columns', async () => {
    await saveEvents(events);

    const result = await pool.query(
      "SELECT user_name, user_arn, success, source_ip_address, raw->>'eventName' AS raw_event_name FROM events WHERE event_name = 'ConsoleLogin'",
    );

    expect(result.rows[0]).toEqual({
      user_name: 'admin',
      user_arn: null,
      success: false,
      source_ip_address: '203.0.113.45',
      raw_event_name: 'ConsoleLogin',
    });
  });

  it('saves nothing if any event in the batch fails', async () => {
    const first = events[0];
    if (first === undefined) {
      throw new Error('Sample file has no events');
    }
    const broken = {
      ...first,
      eventID: 'broken-event',
      eventTime: 'not-a-date',
    };
    await expect(
      saveEvents([...events, broken]),
    ).rejects.toThrow();
    expect(await countRows()).toBe(0);
  });
});
