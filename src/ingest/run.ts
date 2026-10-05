import {
  readCloudTrailFile,
  ingestCloudTrail,
} from './ingest.js';
import { saveEvents } from '../db/events.js';
import { pool } from '../db/client.js';

const path = process.argv[2];

if (path === undefined) {
  console.error(
    'Usage: npm run ingest -- <path to CloudTrail file>',
  );
  process.exit(1);
}

const contents = await readCloudTrailFile(path);
const events = ingestCloudTrail(contents);
const inserted = await saveEvents(events);

console.log(
  `Read ${events.length} unique events from ${path}`,
);
console.log(
  `Saved ${inserted} new events (${events.length - inserted} were already in the database)`,
);

await pool.end();

// To print events, uncomment below:
// for (const event of events) {
//   const status = event.success ? 'ok    ' : 'FAILED';
//   const who =
//     event.userName ?? event.userArn ?? event.userType;
//   console.log(
//     `${event.eventTime} ${status} ${event.eventName.padEnd(18)} ${who} from ${event.sourceIPAddress}`,
//   );
// }
