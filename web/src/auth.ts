import { UserManager } from 'oidc-client-ts';

const authority = import.meta.env.VITE_COGNITO_AUTHORITY;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const domain = import.meta.env.VITE_COGNITO_DOMAIN;

export const congitoEnabled = Boolean(
  authority && clientId && domain,
);

const returnUrl = `${window.location.origin}/`;

const manager = congitoEnabled
  ? new UserManager({
      authority: authority!,
      client_id: clientId!,
      redirect_uri: returnUrl,
      response_type: 'code',
      scope: 'openid email',
    })
  : null;

export async function startSignIn(): Promise<void> {
  await manager?.signinRedirect();
}

let session: Promise<string | null> | null = null;

export function currentIdToken(): Promise<string | null> {
  session ??= (async () => {
    if (manager === null) return null;

    const params = new URLSearchParams(
      window.location.search,
    );
    if (params.has('code') && params.has('state')) {
      await manager.signinCallback();
      window.history.replaceState(null, '', '/');
    }

    const user = await manager.getUser();
    return user && !user.expired
      ? (user.id_token ?? null)
      : null;
  })();
  return session;
}

export async function forgetSession(): Promise<void> {
  session = null;
  await manager?.removeUser();
}

export async function signOutOfCognito(): Promise<void> {
  if (manager === null) return;
  await manager.removeUser();
  session = null;
  const params = new URLSearchParams({
    client_id: clientId!,
    logout_uri: returnUrl,
  });
  window.location.assign(`${domain}/logout?${params}`);
}
