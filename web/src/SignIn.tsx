import { useState, type SubmitEvent } from 'react';
import {
  AuthError,
  apiFetch,
  type CurrentUser,
} from './api';
import { congitoEnabled, startSignIn } from './auth';
import { usePageTitle } from './usePageTitle';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo-hire-Tamer-pronto-2026';

interface SignInProps {
  onSignIn: (token: string, user: CurrentUser) => void;
}

export default function SignIn({ onSignIn }: SignInProps) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  usePageTitle('Sign in');

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    setChecking(true);

    const trimmed = token.trim();
    try {
      const user = await apiFetch<CurrentUser>(
        '/me',
        trimmed,
      );
      onSignIn(trimmed, user);
    } catch (err) {
      setError(
        err instanceof AuthError
          ? 'That token was not accepted.'
          : 'Could not reach the API.',
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <header className='topbar'>
        <div className='topbar-inner'>
          <h1>Security findings</h1>
        </div>
      </header>
      <main>
        <section
          className='panel sign-in'
          aria-labelledby='sign-in-heading'
        >
          <h2 id='sign-in-heading'>Sign in</h2>
          {congitoEnabled ? (
            <>
              <div className='demo-login'>
                <h3>Try the demo</h3>
                <p>
                  A view-only account: browse every finding,
                  but recording reviews is turned off.
                </p>
                <dl>
                  <dt>Email</dt>
                  <dd>
                    <code>{DEMO_EMAIL}</code>
                  </dd>
                  <dt>Password</dt>
                  <dd>
                    <code>{DEMO_PASSWORD}</code>
                  </dd>
                </dl>
                <button
                  type='button'
                  className='button-primary'
                  onClick={() =>
                    void startSignIn(DEMO_EMAIL)
                  }
                >
                  Sign in to the demo
                </button>
              </div>
              <p className='hint'>
                Analysts sign in with an account created by
                an administrator; there is no sign-up.
              </p>
              <button
                type='button'
                onClick={() => void startSignIn()}
              >
                Analyst sign in
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <label htmlFor='token'>Access token</label>
              <textarea
                id='token'
                rows={4}
                value={token}
                onChange={(event) =>
                  setToken(event.target.value)
                }
                aria-describedby='token-help'
                required
              />
              <p id='token-help' className='hint'>
                Create one with{' '}
                <code>
                  npm run token -- your-id "Your Name"
                </code>
              </p>
              {error && <p role='alert'>{error}</p>}
              <button
                type='submit'
                className='button-primary'
                disabled={checking}
              >
                {checking ? 'Checking...' : 'Sign in'}
              </button>
            </form>
          )}
        </section>
      </main>
    </>
  );
}
