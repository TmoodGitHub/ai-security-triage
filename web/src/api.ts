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
