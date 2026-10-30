import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { normalizeEvent } from './normalize.js';
import { dedupeEvents } from './dedupe.js';
import type {
  CloudTrailEvent,
  NormalizedEvent,
} from './types.js';

export function decodeCloudTrailFile(
  bytes: Uint8Array,
  name: string,
): string {
  const data = name.endsWith('.gz')
    ? gunzipSync(bytes)
    : bytes;
  return Buffer.from(data).toString('utf8');
}

export async function readCloudTrailFile(
  path: string,
): Promise<string> {
  return decodeCloudTrailFile(await readFile(path), path);
}

export function parseCloudTrailFile(
  contents: string,
): CloudTrailEvent[] {
  const parsed: unknown = JSON.parse(contents);

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('Records' in parsed) ||
    !Array.isArray(parsed.Records)
  ) {
    throw new Error(
      'Not a CloudTrail file: expected an object with a "Records" array',
    );
  }

  return parsed.Records as CloudTrailEvent[];
}

export function ingestCloudTrail(
  contents: string,
): NormalizedEvent[] {
  const events = parseCloudTrailFile(contents);
  const normalized = events.map(normalizeEvent);
  return dedupeEvents(normalized);
}
