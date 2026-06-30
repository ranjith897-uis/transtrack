import { Pool } from 'pg';
import { config } from '@/config/env';

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // A broken idle client shouldn't crash the whole process.
  console.error('[db] unexpected error on idle client', err);
});

/** Convenience query helper. Throws on error, caller handles. */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
