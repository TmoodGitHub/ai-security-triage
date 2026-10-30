import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { S3Event } from 'aws-lambda';
import {
  chunk,
  createIntakeHandler,
  decodeS3Key,
} from '../src/ingest/intake.js';
import type { NormalizedEvent } from '../src/ingest/types.js';

const sampleBytes = readFileSync(
  new URL(
    '../samples/cloudtrail_sample.json',
    import.meta.url,
  ),
);

function s3Event(key: string): S3Event {
  return {
    Records: [
      {
        s3: { bucket: { name: 'intake' }, object: { key } },
      },
    ],
  } as unkonwn as S3Event;
}

interface Sent {
  input: Record<string, any>;
}

function fakes(
  options: { body?: Uint8Array; failQueue?: boolean } = {},
) {
  const s3Sent: Sent[] = [];
  const sqsSent: Sent[] = [];
  const saved: NormalizedEvent[][] = [];

  const s3 = {
    async send(command: Sent) {
      s3Sent.push(command);
      const body = options.body ?? sampleBytes;
      return {
        Body: { transformToByteArray: async () => body },
      };
    },
  } as unknown as S3Client;

  const sqs = {
    async send(command: Sent) {
      sqsSent.push(command);
      return options.failQueue
        ? {
            Failed: [
              {
                Id: '0',
                SenderFault: false,
                Code: 'InternalError',
              },
            ],
          }
        : { Successful: [] };
    },
  } as unknown as SQSClient;

  const handler = createIntakeHandler({
    s3,
    sqs,
    queueUrl: 'https://sqs.example/queue',
    saveEvents: async (events) => {
      saved.push(events);
      return events.length;
    },
  });

  return { handler, s3Sent, sqsSent, saved };
}

describe('decodeS3Key', () => {
  it('undoes the URL encoding S3 notification use', () => {
    expect(decodeS3Key('logs/my+file%3A1.json')).toBe(
      'logs/my file:1.json',
    );
  });
});

describe('chunk', () => {
  it('splits a list into groups of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(chunk([], 10)).toEqual([]);
  });
});

describe('intake handler', () => {
  it('read the uploaded file, saves its events and queues each one', async () => {
    const { handler, s3Sent, sqsSent, saved } = fakes();

    await handler(s3Event('logs/sample.json'));

    expect(s3Sent[0]?.input).toEqual({
      Bucket: 'intake',
      Key: 'logs/sample.json',
    });
    expect(saved[0]).toHaveLength(5);
    const bodies = sqsSent[0]?.input.Entries.map(
      (entry: { MessageBody: string }) =>
        JSON.parse(entry.MessageBody),
    );
    expect(bodies).toEqual(
      saved[0]?.map((event) => ({
        eventId: event.eventID,
      })),
    );
  });

  it('reads gzipped CloudTrail files', async () => {
    const { handler, saved } = fakes({
      body: gzipSync(sampleBytes),
    });

    await handler(s3Event('logs/sample.json.gz'));

    expect(saved[0]).toHaveLength(5);
  });

  it('fails when any event could not be queued, so Lambda retries', async () => {
    const { handler } = fakes({ failQueue: true });

    await expect(
      handler(s3Event('logs/sample.json')),
    ).rejects.toThrow('Failed to queue 1 events');
  });
});
