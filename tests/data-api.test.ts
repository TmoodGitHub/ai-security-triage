import { describe, it, expect } from 'vitest';
import type { RDSDataClient } from '@aws-sdk/client-rds-data';
import {
  createDataApiDb,
  toNamedParameters,
  toSqlParameter,
} from '../src/db/data-api.js';

const config = {
  resourceArn:
    'arn:aws:rds:us-east-1:123456789012:cluster:test',
  secretArn:
    'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
  database: 'triage',
};

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

function fakeClient(response: unknown[]) {
  const sent: SentCommand[] = [];
  const client = {
    async send(command: {
      constructor: { name: string };
      input: object;
    }) {
      sent.push({
        name: command.constructor.name,
        input: command.input as Record<string, unknown>,
      });
      const next = response.shift();
      if (next instanceof Error) throw next;
      return next ?? {};
    },
    destroy() {},
  };
  return {
    client: client as unknown as RDSDataClient,
    sent,
  };
}

function resumingError(): Error {
  const error = new Error('Database is resuming');
  error.name = 'DatabaseResumingException';
  return error;
}

describe('toNamedParameters', () => {
  it('rewrites positional parameters and casts', () => {
    expect(
      toNamedParameters(
        'WHERE ($1::text IS NULL OR severity = $1) LIMIT $3',
      ),
    ).toBe(
      'WHERE (CAST(:p1 AS text) IS NULL OR severity = :p1) LIMIT :p3',
    );
  });
});

describe('toSqlParameters', () => {
  it('maps each JavaScript type to a Data API value', () => {
    expect(toSqlParameter('high', 0)).toEqual({
      name: 'p1',
      value: { stringValue: 'high' },
    });
    expect(toSqlParameter(50, 1).value).toEqual({
      longValue: 50,
    });
    expect(toSqlParameter(0.5, 2).value).toEqual({
      doubleValue: 0.5,
    });
    expect(toSqlParameter(true, 3).value).toEqual({
      booleanValue: true,
    });
    expect(toSqlParameter(null, 4).value).toEqual({
      isNull: true,
    });
  });

  it('rejects arrays, which the Data API does not support', () => {
    expect(() => toSqlParameter(['a'], 0)).toThrow('$1');
  });
});

describe('createDataApiDb', () => {
  it('returns rows shaped like node-postgres rows', async () => {
    const { client } = fakeClient([
      {
        columnMetadata: [
          { label: 'id', typeName: 'int8' },
          {
            label: 'createdAt',
            typeName: 'timestamptz',
          },
          { label: 'event', typeName: 'jsonb' },
          { label: 'evidence', typeName: '_text' },
          { label: 'reviewNote', typeName: 'text' },
        ],
        records: [
          [
            { longValue: 7 },
            { stringValue: '2026-10-21 12:00:00.5' },
            {
              stringValue: '{"eventName":"ConsoleLogin"}',
            },
            {
              arrayValue: {
                stringValues: ['one', 'two'],
              },
            },
            { isNull: true },
          ],
        ],
      },
    ]);
    const db = createDataApiDb(config, { client });

    const result = await db.query('SELECT ...');

    expect(result.rows).toEqual([
      {
        id: '7',
        createdAt: new Date('2026-10-21T12:00:00.500Z'),
        event: { eventName: 'ConsoleLogin' },
        evidence: ['one', 'two'],
        reviewNote: null,
      },
    ]);
    expect(result.rowCount).toBe(1);
  });

  it('counts rows changed by a statement with no RETURNING', async () => {
    const { client } = fakeClient([
      { numberOfRecordsUpdated: 1 },
    ]);
    const db = createDataApiDb(config, { client });

    const result = await db.query('INSERT ...', ['a']);

    expect(result.rowCount).toBe(1);
  });

  it('retries while the database resumes', async () => {
    const { client, sent } = fakeClient([
      resumingError(),
      resumingError(),
      { records: [] },
    ]);
    const db = createDataApiDb(config, {
      client,
      retryDelayMs: 0,
    });

    await db.query('SELECT 1');

    expect(sent).toHaveLength(3);
  });

  it('gives up after the last attempt', async () => {
    const { client } = fakeClient([
      resumingError(),
      resumingError(),
    ]);
    const db = createDataApiDb(config, {
      client,
      retryDelayMs: 0,
      maxAttempts: 2,
    });

    await expect(db.query('SELECT 1')).rejects.toThrow(
      'resuming',
    );
  });

  it('commits a transaction and sends every statement in it', async () => {
    const { client, sent } = fakeClient([
      { transactionId: 'tx-1' },
      { numberOfRecordsUpdated: 1 },
      { numberOfRecordsUpdated: 1 },
      {},
    ]);
    const db = createDataApiDb(config, { client });

    const inserted = await db.transaction(async (tx) => {
      const first = await tx.query('INSERT ...', ['a']);
      const second = await tx.query('INSERT...', ['b']);
      return first.rowCount + second.rowCount;
    });

    expect(inserted).toBe(2);
    expect(sent.map((command) => command.name)).toEqual([
      'BeginTransactionCommand',
      'ExecuteStatementCommand',
      'ExecuteStatementCommand',
      'CommitTransactionCommand',
    ]);
    expect(sent[1]?.input.transactionId).toBe('tx-1');
    expect(sent[2]?.input.transactionId).toBe('tx-1');
  });

  it('rolls back a transaction when the work fails', async () => {
    const { client, sent } = fakeClient([
      { transactionId: 'tx-1' },
      new Error('duplicate key'),
      {},
    ]);
    const db = createDataApiDb(config, { client });

    await expect(
      db.transaction((tx) => tx.query('INSERT...', ['a'])),
    ).rejects.toThrow('duplicate key');
    expect(sent.at(-1)?.name).toBe(
      'RollbackTransactionCommand',
    );
  });
});
