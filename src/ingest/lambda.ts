import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { saveEvents } from '../db/events.js';
import { createIntakeHandler } from './intake.js';

const queueUrl = process.env.TRIAGE_QUEUE_URL;
if (queueUrl === undefined || queueUrl === '') {
  throw new Error(
    'Missing environment variable: TRIAGE_QUEUE_URL',
  );
}

export const handler = createIntakeHandler({
  s3: new S3Client({}),
  sqs: new SQSClient(),
  queueUrl,
  saveEvents,
});
