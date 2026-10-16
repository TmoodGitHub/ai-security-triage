import { useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  type CurrentUser,
  type Filters,
} from './api';
import FindingDetail from './FindingDetail';
import FindingsList from './FindingsList';
import SignIn from './SignIn';

const TOKEN_KEY = 'triage-token';

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<CurrentUser | null>(
    null,
  );
  const [filters, setFilters] = useState<Filters>({
    severity: '',
    status: 'pending',
  });
  const [selectedId, setSelectedId] = useState<
    string | null
  >(null);
  const [lastViewedId, setLastViewedId] = useState<
    string | null
  >(null);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setSelectedId(null);
    setLastViewedId(null);
  }, []);

  useEffect(() => {
    if (token === null || user !== null) {
      return;
    }
    apiFetch<CurrentUser>('/me', token)
      .then(setUser)
      .catch(() => signOut());
  }, [token, user, signOut]);

  function signIn(newToken: string, newUser: CurrentUser) {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function closeFinding() {
    setLastViewedId(selectedId);
    setSelectedId(null);
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
          Sign out
        </button>
      </header>
      {selectedId === null ? (
        <FindingsList
          token={token}
          filters={filters}
          focusId={lastViewedId}
          onFilterChange={setFilters}
          onSelect={setSelectedId}
          onAuthError={signOut}
        />
      ) : (
        <FindingDetail
          id={selectedId}
          token={token}
          onBack={closeFinding}
          onAuthError={signOut}
        />
      )}
    </main>
  );
}
