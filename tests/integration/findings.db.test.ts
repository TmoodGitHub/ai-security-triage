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
import { db, pool } from '../../src/db/client.js';
import { buildApp } from '../../src/api/app.js';
import { authHeaders, verify } from '../helpers.js';

const samplePath = new URL(
  '../../samples/cloudtrail_sample.json',
  import.meta.url,
);
const events = ingestCloudTrail(
  readFileSync(samplePath, 'utf-8'),
);
const app = buildApp({ db, verify, logger: false });
let headers: { authorization: string };

async function addFinding(
  eventName: string,
  severity: string,
  reviewStatus = 'pending',
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO findings (event_id, severity, summary, reasoning, evidence, unknowns, model, review_status)
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

beforeAll(async () => {
  headers = await authHeaders('analyst-1');
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

  it('list findings with the most severe first', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings',
      headers,
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
      headers,
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
      headers,
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
      headers,
    });

    expect(response.json().findings).toHaveLength(1);
  });
});

describe('GET /findings/summary (needs the database running)', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE events, findings');
    await saveEvents(events);
  });

  it('counts findings by review status and pending severity', async () => {
    await addFinding('ListBuckets', 'low', 'approved');
    await addFinding('ConsoleLogin', 'medium', 'rejected');
    await addFinding('DeleteTrail', 'critical');
    await addFinding('RunInstances', 'high');

    const response = await app.inject({
      method: 'GET',
      url: '/findings/summary',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pending: 2,
      approved: 1,
      rejected: 1,
      pendingBySeverity: {
        critical: 1,
        high: 1,
        medium: 0,
        low: 0,
      },
      agreementRate: 0.5,
    });
  });

  it('reports no agreement rate before anything is reviewed', async () => {
    await addFinding('DeleteTrail', 'critical');

    const response = await app.inject({
      method: 'GET',
      url: '/findings/summary',
      headers,
    });

    expect(response.json().agreementRate).toBeNull();
  });
});

describe('GET /findings/:id (needs the database running', async () => {
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
      headers,
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

  it('returns 404 for a finding that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/findings/999999999',
      headers,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'Finding not found',
    });
  });
});

describe('POST /findings/:id/review (needs the database running', () => {
  let findingId: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE events, findings');
    await saveEvents(events);
    findingId = await addFinding('DeleteTrail', 'critical');
  });

  it('records the decision, classification, and note', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/findings/${findingId}/review`,
      headers,
      payload: {
        decision: 'approved',
        classification: 'true_positive',
        note: 'Confirmed: trail deleted from an unknown IP',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reviewStatus: 'approved',
      classification: 'true_positive',
      reviewNote:
        'Confirmed: trail deleted from an unknown IP',
      reviewedBy: 'analyst-1',
    });
    expect(response.json().reviewedAt).not.toBeNull();

    const saved = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}`,
      headers,
    });
    expect(saved.json()).toMatchObject({
      reviewStatus: 'approved',
      classification: 'true_positive',
    });
  });

  it('refuses to review a finding twice', async () => {
    await app.inject({
      method: 'POST',
      url: `/findings/${findingId}/review`,
      headers,
      payload: {
        decision: 'approved',
        classification: 'true_positive',
        note: 'First review',
      },
    });

    const second = await app.inject({
      method: 'POST',
      url: `/findings/${findingId}/review`,
      headers,
      payload: {
        decision: 'rejected',
        classification: 'false_positive',
        note: 'Second review',
      },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      error: 'Finding was already approved',
    });
  });

  it('returns 404 when reviewing a finding that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/findings/9999999/review',
      headers,
      payload: {
        decision: 'approved',
        classification: 'true_positive',
        note: 'Does not exist',
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
