import type pg from 'pg';
import type { Db, Queryable } from './types.js';

function wrap(target: pg.Pool | pg.PoolClient): Queryable {
  return {
    async query(sql, params = []) {
      const result = await target.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0,
      };
    },
  };
}

export function createPgDb(pool: pg.Pool): Db {
  return {
    ...wrap(pool),

    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await work(wrap(client));
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    end: () => pool.end(),
  };
}
