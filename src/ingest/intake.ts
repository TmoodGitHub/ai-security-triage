import {
  GetObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  SendMessageBatchCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { S3Event } from 'aws-lambda';
import {
  decodeCloudTrailFile,
  ingestCloudTrail,
} from './ingest.js';
import type { NormalizedEvent } from './types.js';

const SQS_BATCH_LIMIT = 10;

export interface IntakeDeps {
  s3: S3Client;
  sqs: SQSClient;
  queueUrl: string;
  saveEvents: (
    events: NormalizedEvent[],
  ) => Promise<number>;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function decodeS3Key(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, ' '));
}

export function createIntakeHandler(deps: IntakeDeps) {
  return async function handler(
    event: S3Event,
  ): Promise<void> {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeS3Key(record.s3.object.key);

      const object = await deps.s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (object.Body === undefined) {
        throw new Error(
          `s3://${bucket}/${key} has no body`,
        );
      }
      const bytes =
        await object.Body.transformToByteArray();
      const events = ingestCloudTrail(
        decodeCloudTrailFile(bytes, key),
      );
      const saved = await deps.saveEvents(events);

      for (const batch of chunk(events, SQS_BATCH_LIMIT)) {
        const result = await deps.sqs.send(
          new SendMessageBatchCommand({
            QueueUrl: deps.queueUrl,
            Entries: batch.map((e, i) => ({
              Id: String(i),
              MessageBody: JSON.stringify({
                eventId: e.eventID,
              }),
            })),
          }),
        );

        if (
          result.Failed !== undefined &&
          result.Failed.length > 0
        ) {
          throw new Error(
            `Failed to queue ${result.Failed.length} events from ${key}`,
          );
        }
      }

      console.log(
        JSON.stringify({
          key,
          events: events.length,
          saved,
        }),
      );
    }
  };
}
