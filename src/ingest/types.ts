export interface CloudTrailEvent {
  userIdentity: {
    type: string;
    principalId?: string;
    arn?: string;
    accountId?: string;
    userName?: string;
  };
  eventID: string;
  eventTime: string;
  eventSource: string;
  eventName: string;
  eventType: string;
  awsRegion: string;
  sourceIPAddress: string;
  recipientAccountId?: string;
  userAgent?: string;
  responseElements: {
    ConsoleLogin?: string;
  } | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface NormalizedEvent {
  eventID: string;
  eventTime: string;
  eventSource: string;
  eventName: string;
  eventType: string;
  awsRegion: string;
  callerAccountId: string | null;
  sourceIPAddress: string;
  targetAccountId: string | null;
  principalId: string | null;
  userAgent: string | null;
  userType: string;
  userName: string | null;
  userArn: string | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  raw: object;
}
