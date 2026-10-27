import { Pool, type PoolClient } from '@neondatabase/serverless';

export type Row = Record<string, unknown>;

// Minimal database surface shared by Neon (production) and PGlite (tests).
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const noNesting = () => Promise.reject(new Error('Nested transactions are not supported'));

// Neon's Pool speaks the pg protocol over WebSocket, so it runs in Workers and in Node.
// On Workers create one per request and close it before the response ends.
export function createNeonDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 1 });
  return {
    query: async <T extends Row>(sql: string, params?: unknown[]) =>
      (await pool.query(sql, params)).rows as T[],
    async transaction(fn) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('begin');
        const tx: Db = {
          query: async <T extends Row>(sql: string, params?: unknown[]) =>
            (await client.query(sql, params)).rows as T[],
          transaction: noNesting,
          close: () => Promise.resolve(),
        };
        const result = await fn(tx);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
