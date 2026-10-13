import { readFileSync } from 'node:fs';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from 'vitest';
import { ingestCloudTrail } from '../../src/ingest/ingest';
import { saveEvents } from '../../src/db/events';
import { pool } from '../../src/db/client';
import { buildApp } from '../../src/api/app';

const samplePath = new URL(
  '../../samples/cloudtrail_sample.json',
  import.meta.url,
);
const events = ingestCloudTrail(
  readFileSync(samplePath, 'utf-8'),
);
const app = buildApp({ db: pool, logger: false });

async function addFinding(
  eventName: string,
  severity: string,
  reviewStatus = 'pending',
) {
  await pool.query(
    `
            INSERT INTO findings
                (event_id, severity, summary, reasoning, evidence, unknowns, model, review_status)
            SELECT event_id, $2, 'summary', 'reasoning', '{}', '{}', 'test-model', $3
            FROM events WHERE event_name = $1
        `,
    [eventName, severity, reviewStatus],
  );
}

describe('GET /findings (needs the database running', () => {
  beforeAll(() => {
    if (!process.env.POSTGRES_DB?.endsWith('_test')) {
      throw new Error(
        'Refusing to run: these tests delete data and must use a *_test database',
      );
    }
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE events, findings');
    await saveEvents(events);
    await addFinding('ListBuckets', 'low', 'approved');
    await addFinding('ConsoleLogin', 'medium');
    await addFinding('DeleteTrail', 'critical');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('lists findings with the most severe first', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings',
    });

    expect(response.statusCode).toBe(200);
    const severities = response
      .json()
      .findings.map(
        (f: { severity: string }) => f.severity,
      );
    expect(severities).toEqual([
      'critical',
      'medium',
      'low',
    ]);
  });

  it('includes details from the events', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings?severity=critical',
    });

    const [finding] = response.json().findings;
    expect(finding).toMatchObject({
      severity: 'critical',
      eventName: 'DeleteTrail',
      who: 'backup-svc',
      sourceIpAddress: '203.0.113.45',
      reviewStatus: 'pending',
    });
  });

  it('filters by review status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings?status=pending',
    });

    const names = response
      .json()
      .findings.map(
        (f: { eventName: string }) => f.eventName,
      );
    expect(names).toEqual(['DeleteTrail', 'ConsoleLogin']);
  });

  it('applies the limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings?limit=1',
    });

    expect(response.json().findings).toHaveLength(1);
  });
});
