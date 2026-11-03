import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';

const input =
  process.argv[2] ?? 'samples/cloudtrail_sample.json';
const { Records } = JSON.parse(readFileSync(input, 'utf8'));

const newIds = new Map();
const newId = (id) => {
  if (!newIds.has(id)) newIds.set(id, randomUUID());
  return newIds.get(id);
};

const latest = Math.max(
  ...Records.map((r) => Date.parse(r.eventTime)),
);
const shift = Date.now() - latest;
const toCloudTrailTime = (ms) =>
  new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const fresh = Records.map((record) => ({
  ...record,
  eventID: newId(record.eventID),
  eventTime: toCloudTrailTime(
    Date.parse(record.eventTime) + shift,
  ),
}));

mkdirSync('build/samples', { recursive: true });
const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');
const output = `build/samples/fresh-${stamp}.json.gz`;
writeFileSync(
  output,
  gzipSync(JSON.stringify({ Records: fresh })),
);
console.log(output);
