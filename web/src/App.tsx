import { useEffect, useState } from 'react';
import { apiFetch, type CurrentUser } from './api';
import SignIn from './SignIn';

const TOKEN_KEY = 'triage-token';

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<CurrentUser | null>(
    null,
  );

  useEffect(() => {
    if (token === null || user !== null) {
      return;
    }
    apiFetch<CurrentUser>('/me', token)
      .then(setUser)
      .catch(() => signOut());
  }, [token, user]);

  function signIn(newToken: string, newUser: CurrentUser) {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  if (token === null) {
    return <SignIn onSignIn={signIn} />;
  }

  return (
    <main>
      <header>
        <h1>Security Findings</h1>
        {user && (
          <p>Signed in as {user.name ?? user.subject}</p>
        )}
        <button type='button' onClick={signOut}>
          Sign Out
        </button>
      </header>
    </main>
  );
}
