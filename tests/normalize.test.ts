import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { normalizeEvent } from '../src/ingest/normalize.js';
import { CloudTrailEvent } from '../src/ingest/types.js';

const samplePath = new URL(
  '../samples/cloudtrail_sample.json',
  import.meta.url,
);
const sample = JSON.parse(
  readFileSync(samplePath, 'utf8'),
) as { Records: CloudTrailEvent[] };

function sampleEvent(index: number): CloudTrailEvent {
  const event = sample.Records[index];
  if (event === undefined) {
    throw new Error(`No sample event at index ${index}`);
  }
  return event;
}

describe('NormalizeEvent', () => {
  it('copies the basic fields from a normal IAM user event', () => {
    const result = normalizeEvent(sampleEvent(0));

    expect(result.eventID).toBe(
      'a1f3c2d4-1111-4a2b-9c3d-000000000001',
    );
    expect(result.eventName).toBe('ListBuckets');
    expect(result.eventSource).toBe('s3.amazonaws.com');
    expect(result.userType).toBe('IAMUser');
    expect(result.userName).toBe('dev-tamer');
    expect(result.userArn).toBe(
      'arn:aws:iam::123456789012:user/dev-tamer',
    );
    expect(result.principalId).toBe('AIDAEXAMPLEDEVUSER01');
    expect(result.callerAccountId).toBe('123456789012');
    expect(result.targetAccountId).toBe('123456789012');
    expect(result.success).toBe(true);
    expect(result.errorCode).toBeNull();
    expect(result.errorMessage).toBeNull();
  });

  it('sets userName to null for an assumed role but keeps the ARN', () => {
    const result = normalizeEvent(sampleEvent(2));

    expect(result.userType).toBe('AssumedRole');
    expect(result.userName).toBeNull();
    expect(result.userArn).toBe(
      'arn:aws:sts::123456789012:assumed-role/reports-role/reports-job',
    );
  });

  it('marks a failed console login as unsuccessful even without an errorCode', () => {
    const result = normalizeEvent(sampleEvent(3));

    expect(result.eventName).toBe('ConsoleLogin');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBeNull();
    expect(result.errorMessage).toBe(
      'Failed authentication',
    );
    expect(result.userArn).toBeNull();
  });

  it('marks an event with an errorCode as unsuccessful', () => {
    const event: CloudTrailEvent = {
      ...sampleEvent(0),
      errorCode: 'AccessDenied',
    };

    const result = normalizeEvent(event);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('AccessDenied');
  });

  it('turns missing optional fields into null', () => {
    const event: CloudTrailEvent = {
      userIdentity: { type: 'AWSService' },
      eventID: 'test-aws-service-event',
      eventTime: '2026-09-22T10:00:00Z',
      eventSource: 'kms.amazonaws.com',
      eventName: 'Decrypt',
      eventType: 'AwsApiCall',
      awsRegion: 'us-east-1',
      sourceIPAddress: 'AWS Internal',
      responseElements: null,
    };

    const result = normalizeEvent(event);

    expect(result.principalId).toBeNull();
    expect(result.callerAccountId).toBeNull();
    expect(result.targetAccountId).toBeNull();
    expect(result.userAgent).toBeNull();
    expect(result.userName).toBeNull();
    expect(result.userArn).toBeNull();
    expect(result.success).toBe(true);
  });

  it('keeps the original event in raw, including fields it does not normalize', () => {
    const original = sampleEvent(4);

    const result = normalizeEvent(original);

    expect(result.raw).toEqual(original);
    expect(result.raw).toHaveProperty(
      'requestParameters.name',
      'management-events',
    );
  });
});
