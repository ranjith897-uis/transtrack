import fs from 'fs';
import path from 'path';
import { pool } from '@/db/pool';

/**
 * Minimal migration runner: executes every .sql file in db/migrations,
 * in filename order, inside a transaction, tracking what's already run
 * in a `_migrations` table. Good enough for a single-operator system;
 * swap for a proper tool (node-pg-migrate, Prisma Migrate) if this ever
 * grows a team of engineers working on schema changes concurrently.
 */
async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
    if (rows.length > 0) {
      console.log(`[migrate] skip (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    console.log(`[migrate] applying: ${file}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] done: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] FAILED on ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('[migrate] all migrations applied');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
