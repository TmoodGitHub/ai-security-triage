import { useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  type CurrentUser,
  type Filters,
} from './api';
import {
  congitoEnabled,
  currentIdToken,
  forgetSession,
  signOutOfCognito,
} from './auth';
import FindingDetail from './FindingDetail';
import FindingsList from './FindingsList';
import SignIn from './SignIn';
import SummaryPanel from './SummaryPanel';

const TOKEN_KEY = 'triage_token';

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    congitoEnabled
      ? null
      : sessionStorage.getItem(TOKEN_KEY),
  );

  const [checkingSession, setCheckingSession] =
    useState(congitoEnabled);
  const [user, setUser] = useState<CurrentUser | null>(
    null,
  );
  const [filters, setFilters] = useState<Filters>({
    severity: '',
    status: 'pending',
  });
  const [selectedId, setselectedId] = useState<
    string | null
  >(null);
  const [lastViewedId, setLastViewedId] = useState<
    string | null
  >(null);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setselectedId(null);
    setLastViewedId(null);
  }, []);

  const handleAuthError = useCallback(() => {
    clearSession();
    void forgetSession();
  }, [clearSession]);

  function signOut() {
    clearSession();
    if (congitoEnabled) {
      void signOutOfCognito();
    }
  }

  useEffect(() => {
    if (!congitoEnabled) {
      return;
    }
    currentIdToken()
      .then(setToken)
      .catch(() => setToken(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (token === null || user !== null) {
      return;
    }
    apiFetch<CurrentUser>('/me', token)
      .then(setUser)
      .catch(handleAuthError);
  }, [token, user, handleAuthError]);

  function signIn(newToken: string, newUser: CurrentUser) {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function closeFinding() {
    setLastViewedId(selectedId);
    setselectedId(null);
  }

  if (checkingSession) {
    return null;
  }

  if (token === null) {
    return <SignIn onSignIn={signIn} />;
  }

  return (
    <>
      <header className='topbar'>
        <div className='topbar-inner'>
          <h1>Security findings</h1>
          {user && (
            <p>Signed in as {user.name ?? user.subject}</p>
          )}
          <button type='button' onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        {selectedId === null ? (
          <>
            <SummaryPanel
              token={token}
              filters={filters}
              onFilterChange={setFilters}
              onAuthError={handleAuthError}
            />
            <FindingsList
              token={token}
              filters={filters}
              focusId={lastViewedId}
              onFilterChange={setFilters}
              onSelect={setselectedId}
              onAuthError={handleAuthError}
            />
          </>
        ) : (
          <FindingDetail
            id={selectedId}
            token={token}
            onBack={closeFinding}
            onAuthError={handleAuthError}
          />
        )}
      </main>
    </>
  );
}
