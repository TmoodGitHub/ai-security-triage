import { useSyncExternalStore } from 'react';
import { isDatabaseWaking, onDatabaseWaking } from './api';

export function useDatabaseWaking(): boolean {
  return useSyncExternalStore(
    onDatabaseWaking,
    isDatabaseWaking,
  );
}
