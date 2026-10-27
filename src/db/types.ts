export interface QueryResult<Row> {
  rows: Row[];
  rowCount: number;
}

export interface Queryable {
  query<Row = any>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface Db extends Queryable {
  transaction<T>(
    work: (tx: Queryable) => Promise<T>,
  ): Promise<T>;
  end(): Promise<void>;
}
