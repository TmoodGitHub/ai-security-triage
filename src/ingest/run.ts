import {
  readCloudTrailFile,
  ingestCloudTrail,
} from './ingest.js';

const path = process.argv[2];

if (path === undefined) {
  console.error(
    'Usage: npm run ingest -- <path to CloudTrail file>',
  );
  process.exit(1);
}

const contents = await readCloudTrailFile(path);
const events = ingestCloudTrail(contents);

console.log(
  `Ingested ${events.length} unique events from ${path}\n`,
);
for (const event of events) {
  const status = event.success ? 'ok    ' : 'FAILED';
  const who =
    event.userName ?? event.userArn ?? event.userType;
  console.log(
    `${event.eventTime} ${status} ${event.eventName.padEnd(18)} ${who} from ${event.sourceIPAddress}`,
  );
}
