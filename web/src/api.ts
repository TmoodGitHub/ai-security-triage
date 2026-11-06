export class AuthError extends Error {}

export interface CurrentUser {
  subject: string;
  name: string | null;
  canReview: boolean;
}

const RESUME_RETRY_MS = 5_000;
const RESUME_MAX_WAIT_MS = 120_000;

let waitingRequests = 0;
const wakingListeners = new Set<() => void>();

export function onDatabaseWaking(listener: () => void) {
  wakingListeners.add(listener);
  return () => {
    wakingListeners.delete(listener);
  };
}

export function isDatabaseWaking(): boolean {
  return waitingRequests > 0;
}

function setWaiting(change: 1 | -1) {
  waitingRequests += change;
  wakingListeners.forEach((listener) => listener());
}

async function isResuming(response: Response) {
  if (response.status !== 503) return false;
  const body = await response
    .clone()
    .json()
    .catch(() => ({}));
  return body.code === 'database_resuming';
}

export async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const send = () =>
    fetch(`/api${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        ...(init.body
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });

  let response = await send();
  if (await isResuming(response)) {
    setWaiting(1);
    try {
      for (
        let waited = 0;
        waited < RESUME_MAX_WAIT_MS &&
        (await isResuming(response));
        waited += RESUME_RETRY_MS
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, RESUME_RETRY_MS),
        );
        response = await send();
      }
    } finally {
      setWaiting(-1);
    }
  }

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

export type SortColumn =
  | 'severity'
  | 'eventName'
  | 'who'
  | 'eventTime'
  | 'status';

export interface Sort {
  column: SortColumn;
  order: 'asc' | 'desc';
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

export interface FindingsSummary {
  pending: number;
  approved: number;
  rejected: number;
  pendingBySeverity: Record<Severity, number>;
  agreementRate: number | null;
}
