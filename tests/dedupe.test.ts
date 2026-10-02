import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { normalizeEvent } from '../src/ingest/normalize.js';
import { dedupeEvents } from '../src/ingest/dedupe.js';
import type { CloudTrailEvent } from '../src/ingest/types.js';

const samplePath = new URL(
  '../samples/cloudtrail_sample.json',
  import.meta.url,
);
const sample = JSON.parse(
  readFileSync(samplePath, 'utf8'),
) as { Records: CloudTrailEvent[] };
const normalized = sample.Records.map(normalizeEvent);

describe('dedupeEvents', () => {
  it('removes the duplicate event from the sample file', () => {
    const result = dedupeEvents(normalized);

    expect(normalized).toHaveLength(6);
    expect(result).toHaveLength(5);
  });

  it('leaves every eventID appearing exactly once', () => {
    const result = dedupeEvents(normalized);
    const ids = result.map((event) => event.eventID);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the first copy and the original order', () => {
    const result = dedupeEvents(normalized);

    expect(result.map((event) => event.eventName)).toEqual([
      'ListBuckets',
      'RunInstances',
      'DescribeInstances',
      'ConsoleLogin',
      'DeleteTrail',
    ]);
    expect(result[0]).toBe(normalized[0]);
  });

  it('returns an empty list when given an empty list', () => {
    expect(dedupeEvents([])).toEqual([]);
  });
});
