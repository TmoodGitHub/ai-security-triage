import type {
  CloudTrailEvent,
  NormalizedEvent,
} from './types.js';

export function normalizeEvent(
  event: CloudTrailEvent,
): NormalizedEvent {
  const identity = event.userIdentity;

  const loginFailed =
    event.responseElements?.ConsoleLogin === 'Failure';
  const success =
    event.errorCode === undefined && !loginFailed;

  return {
    eventID: event.eventID,
    eventTime: event.eventTime,
    eventSource: event.eventSource,
    eventName: event.eventName,
    eventType: event.eventType,
    awsRegion: event.awsRegion,
    sourceIPAddress: event.sourceIPAddress,
    callerAccountId: identity.accountId ?? null,
    targetAccountId: event.recipientAccountId ?? null,
    principalId: identity.principalId ?? null,
    userAgent: event.userAgent ?? null,
    userType: identity.type,
    userName: identity.userName ?? null,
    userArn: identity.arn ?? null,
    success,
    errorCode: event.errorCode ?? null,
    errorMessage: event.errorMessage ?? null,
    raw: event,
  };
}
