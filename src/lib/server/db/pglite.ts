import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Db, Row } from './index.ts';

// PGlite's query() takes a single statement; exec() handles multi-statement scripts (migrations).
async function run<T extends Row>(conn: PGlite | Transaction, sql: string, params?: unknown[]) {
  if (params) return (await conn.query<T>(sql, params)).rows;
  const results = await conn.exec(sql);
  return (results.at(-1)?.rows ?? []) as T[];
}

// In-memory Postgres for tests; never imported by the deployed worker.
export function createPgliteDb(pglite = new PGlite()): Db {
  return {
    query: <T extends Row>(sql: string, params?: unknown[]) => run<T>(pglite, sql, params),
    transaction: (fn) =>
      pglite.transaction((tx) =>
        fn({
          query: <T extends Row>(sql: string, params?: unknown[]) => run<T>(tx, sql, params),
          transaction: () => Promise.reject(new Error('Nested transactions are not supported')),
          close: () => Promise.resolve(),
        }),
      ),
    close: () => pglite.close(),
  };
}

// pg-style Pool over PGlite so Better Auth (Kysely's PostgresDialect) can run in tests.
export function pgliteAsPool(pglite: PGlite) {
  const query = async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params);
    return {
      rows: r.rows,
      rowCount: r.affectedRows ?? r.rows.length,
      command: sql.trim().split(/\s/)[0]!.toUpperCase(),
    };
  };
  return {
    connect: async () => ({ query, release: () => {} }),
    query,
    end: async () => {},
  };
}
