import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';

const SPACING_MS = 26 * 60 * 60 * 1000;

const input = process.argv[2] ?? 'triage/eval_cases.json';
const parsed = JSON.parse(readFileSync(input, 'utf8'));
const source = Array.isArray(parsed)
  ? parsed.map((c) => c.event)
  : parsed.Records;

const events = [...source].sort(
  (a, b) =>
    Date.parse(a.eventTime) - Date.parse(b.eventTime),
);

const toCloudTrailTime = (ms) =>
  new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const now = Date.now();
const Records = events.map((event, i) => ({
  ...event,
  eventID: randomUUID(),
  eventTime: toCloudTrailTime(
    now - (events.length - 1 - i) * SPACING_MS,
  ),
}));

mkdirSync('build/samples', { recursive: true });
const stamp = new Date(now)
  .toISOString()
  .replace(/[:.]/g, '-');
const output = `build/samples/demo-${stamp}.json.gz`;
writeFileSync(
  output,
  gzipSync(JSON.stringify({ Records })),
);
console.log(output);
