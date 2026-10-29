import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const dataApi = mode === 'data-api';

  return {
    test: {
      env: {
        ...loadEnv(mode, process.cwd(), ''),
        DB_DRIVER: dataApi ? 'data-api' : 'pg',
        POSTGRES_DB: 'triage_test',
        DB_NAME: 'triage_test',
      },
      ...(dataApi
        ? { testTimeout: 60_000, hookTimeout: 60_000 }
        : {}),
    },
  };
});
