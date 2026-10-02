import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { normalizeEvent } from './normalize.js';
import { dedupeEvents } from './dedupe.js';
import type {
  CloudTrailEvent,
  NormalizedEvent,
} from './types.js';

export async function readCloudTrailFile(
  path: string,
): Promise<string> {
  const bytes = await readFile(path);
  if (path.endsWith('.gz')) {
    return gunzipSync(bytes).toString('utf8');
  }
  return bytes.toString('utf8');
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
