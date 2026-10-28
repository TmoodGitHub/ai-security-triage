import { setTimeout as sleep } from 'node:timers/promises';
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type ColumnMetadata,
  type Field,
  type SqlParameter,
} from '@aws-sdk/client-rds-data';
import type { Db, QueryResult } from './types.js';

export interface DataApiConfig {
  resourceArn: string;
  secretArn: string;
  database: string;
}

export interface DataApiOptions {
  client?: RDSDataClient;
  retryDelayMs?: number;
  maxAttempts?: number;
}

export function toNamedParameters(sql: string): string {
  return sql
    .replace(/\$(\d+)::(\w+)/g, 'CAST(:p$1 AS $2)')
    .replace(/\$(\d+)/g, ':p$1');
}

export function toSqlParameter(
  value: unknown,
  index: number,
): SqlParameter {
  const name = `p${index + 1}`;
  if (value === null || value === undefined) {
    return { name, value: { isNull: true } };
  }

  if (typeof value === 'string') {
    return { name, value: { stringValue: value } };
  }

  if (typeof value === 'boolean') {
    return { name, value: { booleanValue: value } };
  }

  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { name, value: { longValue: value } }
      : { name, value: { doubleValue: value } };
  }

  if (value instanceof Date) {
    return {
      name,
      value: { stringValue: value.toISOString() },
    };
  }

  throw new Error(
    `Unsupported paramter type for $${index + 1}: ${typeof value}`,
  );
}

function parseTimestamp(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

export function fromField(
  field: Field,
  column: ColumnMetadata,
): unknown {
  if (field.isNull) return null;

  if (field.arrayValue !== undefined) {
    const array = field.arrayValue;
    return (
      array.stringValues ??
      array.longValues ??
      array.doubleValues ??
      array.booleanValues ??
      []
    );
  }

  const type = column.typeName;

  if (field.stringValue !== undefined) {
    if (type === 'timestamptz' || type === 'timestamp') {
      return parseTimestamp(field.stringValue);
    }

    if (type === 'json' || type == 'jsonb') {
      return JSON.parse(field.stringValue);
    }

    return field.stringValue;
  }

  if (field.longValue !== undefined) {
    return type === 'int8'
      ? String(field.longValue)
      : field.longValue;
  }

  if (field.doubleValue !== undefined)
    return field.doubleValue;
  if (field.booleanValue !== undefined)
    return field.booleanValue;

  throw new Error(
    `Unsupported value in column ${column.name}`,
  );
}

function isResuming(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'DatabaseResumingException'
  );
}

export function createDataApiDb(
  config: DataApiConfig,
  options: DataApiOptions = {},
): Db {
  const client = options.client ?? new RDSDataClient({});
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  const maxAttempts = options.maxAttempts ?? 12;
  const { resourceArn, secretArn, database } = config;

  async function withResumeRetry<T>(
    call: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await call();
      } catch (error) {
        if (!isResuming(error) || attempt >= maxAttempts)
          throw error;
        await sleep(retryDelayMs);
      }
    }
  }

  async function run(
    sql: string,
    params: unknown[],
    transactionId?: string,
  ): Promise<QueryResult<any>> {
    const response = await withResumeRetry(() =>
      client.send(
        new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: toNamedParameters(sql),
          parameters: params.map(toSqlParameter),
          includeResultMetadata: true,
          ...(transactionId === undefined
            ? {}
            : { transactionId }),
        }),
      ),
    );

    const columns = response.columnMetadata ?? [];
    const rows = (response.records ?? []).map((record) =>
      Object.fromEntries(
        record.map((field, i) => {
          const column = columns[i] ?? {};
          return [
            column.label ?? column.name,
            fromField(field, column),
          ];
        }),
      ),
    );

    return {
      rows,
      rowCount: Math.max(
        rows.length,
        response.numberOfRecordsUpdated ?? 0,
      ),
    };
  }

  return {
    query: (sql, params = []) => run(sql, params),

    async transaction(work) {
      const { transactionId } = await withResumeRetry(() =>
        client.send(
          new BeginTransactionCommand({
            resourceArn,
            secretArn,
            database,
          }),
        ),
      );

      if (transactionId === undefined) {
        throw new Error(
          'BeginTransaction returned no transaction ID',
        );
      }

      try {
        const value = await work({
          query: (sql, params = []) =>
            run(sql, params, transactionId),
        });
        await client.send(
          new CommitTransactionCommand({
            resourceArn,
            secretArn,
            transactionId,
          }),
        );
        return value;
      } catch (error) {
        await client.send(
          new RollbackTransactionCommand({
            resourceArn,
            secretArn,
            transactionId,
          }),
        );
        throw error;
      }
    },

    end: async () => client.destroy(),
  };
}
