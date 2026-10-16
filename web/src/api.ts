export class AuthError extends Error {}

export interface CurrentUser {
  subject: string;
  name: string | null;
}

export async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      ...(init.body
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });

  if (response.status === 401) {
    throw new AuthError(
      'Your session has expired or the token is invalid.',
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error ??
        body.message ??
        `Request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}

export type Severity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';
export type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export type Classification =
  | 'true_positive'
  | 'benign_positive'
  | 'false_positive';

export interface Filters {
  severity: Severity | '';
  status: ReviewStatus | '';
}

export interface FindingSummary {
  id: string;
  severity: Severity;
  summary: string;
  reviewStatus: ReviewStatus;
  eventName: string;
  eventTime: string;
  who: string;
  sourceIpAddress: string;
}

export interface FindingDetail {
  id: string;
  eventId: string;
  severity: Severity;
  summary: string;
  reasoning: string;
  evidence: string[];
  unknowns: string[];
  model: string;
  reviewStatus: ReviewStatus;
  classification: Classification | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  event: unknown;
}

export type ReviewResult = Pick<
  FindingDetail,
  | 'reviewStatus'
  | 'classification'
  | 'reviewedAt'
  | 'reviewedBy'
  | 'reviewNote'
>;
