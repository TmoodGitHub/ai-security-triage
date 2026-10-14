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
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO findings 
        (event_id, severity, summary, reasoning, evidence, unknowns, model, review_status)
      SELECT event_id, $2, 'summary', 'reasoning', ARRAY['evidence one'], ARRAY['unknown one'], 'test-model', $3
      FROM events WHERE event_name = $1
      RETURNING id
    `,
    [eventName, severity, reviewStatus],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) {
    throw new Error(`No event named ${eventName}`);
  }
  return id;
}

beforeAll(() => {
  if (!process.env.POSTGRES_DB?.endsWith('_test')) {
    throw new Error(
      'Refusing to run: these tests delete data and must use a *_test database',
    );
  }
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /findings (needs the database running)', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE events, findings');
    await saveEvents(events);
    await addFinding('ListBuckets', 'low', 'approved');
    await addFinding('ConsoleLogin', 'medium');
    await addFinding('DeleteTrail', 'critical');
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

  it('includes details from the event', async () => {
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

  it('filers by review status', async () => {
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

describe('GET /findings/:id (needs the database running)', () => {
  let findingId: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE events, findings');
    await saveEvents(events);
    findingId = await addFinding('DeleteTrail', 'critical');
  });

  it('returns the full finding with its original event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}`,
    });

    expect(response.statusCode).toBe(200);
    const finding = response.json();
    expect(finding).toMatchObject({
      severity: 'critical',
      reasoning: 'reasoning',
      evidence: ['evidence one'],
      unknowns: ['unknown one'],
      reviewStatus: 'pending',
    });
    expect(finding.event.eventName).toBe('DeleteTrail');
    expect(finding.event.requestParameters.name).toBe(
      'management-events',
    );
  });

  it('returns 404 for a finding tha does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings/999999',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'Finding not found',
    });
  });
});

describe('POST /findings:id/review (needs the database running', () => {
  let findingId: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE events, findings');
    await saveEvents(events);
    findingId = await addFinding('DeleteTrail', 'critical');
  });

  it('records an approval with a note', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/findings/${findingId}/review`,
      payload: {
        decision: 'approved',
        note: 'Confirmed: trail deleted from an unknown IP',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reviewStatus: 'approved',
      reviewNote:
        'Confirmed: trail deleted from an unknown IP',
    });
    expect(response.json().reviewedAt).not.toBeNull();

    const saved = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}`,
    });
    expect(saved.json().reviewStatus).toBe('approved');
  });

  it('refuses to review a finding twice', async () => {
    await app.inject({
      method: 'POST',
      url: `/findings/${findingId}/review`,
      payload: { decision: 'approved' },
    });

    const second = await app.inject({
      method: 'POST',
      url: `/findings/${findingId}/review`,
      payload: { decision: 'rejected' },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      error: 'Finding was already approved',
    });
  });

  it('returns 404 when reviewing a finding that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/999999/review',
      payload: { decision: 'approved' },
    });

    expect(response.statusCode).toBe(404);
  });
});
