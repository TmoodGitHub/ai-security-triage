import { useState, type SubmitEvent } from 'react';
import {
  AuthError,
  apiFetch,
  type CurrentUser,
} from './api';
import { usePageTitle } from './usePageTitle';

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
        </section>
      </main>
    </>
  );
}
