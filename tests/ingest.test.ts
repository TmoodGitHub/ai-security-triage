import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import {
  ingestCloudTrail,
  parseCloudTrailFile,
  readCloudTrailFile,
} from '../src/ingest/ingest.js';

const samplePath = new URL(
  '../samples/cloudtrail_sample.json',
  import.meta.url,
);
const sampleText = readFileSync(samplePath, 'utf8');

describe('ingestCloudTrail', () => {
  it('parses, normalizes, and removes duplicates from the sample file', () => {
    const result = ingestCloudTrail(sampleText);

    expect(result).toHaveLength(5);
    expect(result.map((event) => event.eventName)).toEqual([
      'ListBuckets',
      'RunInstances',
      'DescribeInstances',
      'ConsoleLogin',
      'DeleteTrail',
    ]);
    expect(
      result.find(
        (event) => event.eventName === 'ConsoleLogin',
      )?.success,
    ).toBe(false);
  });
});

describe('parseCloudTrailFile', () => {
  it('throws on text that is not JSON', () => {
    expect(() =>
      parseCloudTrailFile('this is not json'),
    ).toThrow();
  });

  it('throws when there is no Records array', () => {
    expect(() =>
      parseCloudTrailFile('{"events": []}'),
    ).toThrow('Not a CloudTrail file');
    expect(() =>
      parseCloudTrailFile('{"Records": "oops"}'),
    ).toThrow('Not a CloudTrail file');
  });

  it('returns an empty list for a file with no events', () => {
    expect(parseCloudTrailFile('{"Records": []}')).toEqual(
      [],
    );
  });
});

describe('readCloudTrailFile', () => {
  it('reads a plain .json file', async () => {
    const contents = await readCloudTrailFile(
      fileURLToPath(samplePath),
    );

    expect(contents).toBe(sampleText);
  });

  it('unzip a .json.gz file, the format AWS actually delivers', async () => {
    const folder = mkdtempSync(
      join(tmpdir(), 'cloudtrail-test-'),
    );
    const gzPath = join(folder, 'sample.json.gz');
    writeFileSync(gzPath, gzipSync(sampleText));

    const contents = await readCloudTrailFile(gzPath);

    expect(contents).toBe(sampleText);
  });
});
