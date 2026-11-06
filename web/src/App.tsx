import { useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  type CurrentUser,
  type Filters,
  type ReviewStatus,
  type Sort,
} from './api';
import {
  congitoEnabled,
  currentIdToken,
  forgetSession,
  signOutOfCognito,
} from './auth';
import FindingDetail from './FindingDetail';
import FindingsList from './FindingsList';
import Sidebar from './Sidebar';
import SignIn from './SignIn';
import SummaryPanel from './SummaryPanel';
import { useDatabaseWaking } from './useDatabaseWaking';

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
  const [sort, setSort] = useState<Sort>({
    column: 'severity',
    order: 'desc',
  });
  const [selectedId, setselectedId] = useState<
    string | null
  >(null);
  const [lastViewedId, setLastViewedId] = useState<
    string | null
  >(null);
  const databaseWaking = useDatabaseWaking();

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

  function selectQueue(status: ReviewStatus | '') {
    setFilters({ severity: '', status });
    setselectedId(null);
    setLastViewedId(null);
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
    <div className='app-shell'>
      <Sidebar
        user={user}
        activeStatus={filters.status}
        onSelectQueue={selectQueue}
        onSignOut={signOut}
      />

      <main>
        <p role='status' className='waking'>
          {databaseWaking &&
            'Waking up the database. After a quiet period this takes up to a minute.'}
        </p>
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
              sort={sort}
              onSortChange={setSort}
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
            canReview={user?.canReview ?? false}
            onBack={closeFinding}
            onAuthError={handleAuthError}
          />
        )}
      </main>
    </div>
  );
}
