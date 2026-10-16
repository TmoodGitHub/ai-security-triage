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
    <main>
      <h1>Security Findings</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor='token'>Access token</label>
        <p id='token-help'>
          Create one with: npm run token -- your-id "Your
          Name"
        </p>
        <textarea
          id='token'
          rows={4}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          aria-describedby='token-help'
          required
        />
        {error && <p role='alert'>{error}</p>}
        <button type='submit' disabled={checking}>
          {checking ? 'Checking...' : 'Sign In'}
        </button>
      </form>
    </main>
  );
}
