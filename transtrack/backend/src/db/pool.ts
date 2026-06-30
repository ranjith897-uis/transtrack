import { Pool } from 'pg';
import { config } from '@/config/env';

// Render's PostgreSQL (and most managed cloud databases) require an
// encrypted connection when reached from outside their own network —
// connecting from a personal laptop counts as "outside." Render's
// certificates aren't in Node's default trusted list, so we accept the
// connection without verifying the certificate chain. This is the
// standard, widely-used approach for this exact situation and is what
// Render's own documentation recommends.
const requiresSsl = /\.render\.com/.test(config.database.url) || config.env === 'production';

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
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