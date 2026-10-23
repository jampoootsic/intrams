import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// DECIMAL/NUMERIC (1700) and BIGINT (20) arrive as strings by default; routes use Number() anyway,
// but parsing here keeps JSON output numeric like mysql2 did.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

// DATABASE_URL (Neon / production) or libpq-style PGHOST/PGPORT/PGUSER/PGDATABASE (devenv sets these).
export const DATABASE_URL = process.env.DATABASE_URL || null;

const needsSsl = DATABASE_URL ? /sslmode=require|neon\.tech/.test(DATABASE_URL) : false;

const pool = new pg.Pool({
  ...(DATABASE_URL ? { connectionString: DATABASE_URL } : {}),
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  // Serverless: many short-lived instances; keep per-instance pool small.
  max: process.env.VERCEL ? 3 : 10,
  idleTimeoutMillis: 10_000,
});

// Convert mysql-style `?` placeholders to `$1..$n`. Question marks inside quotes are left alone.
export function toPg(sql) {
  let i = 0;
  let out = '';
  let quote = null;
  for (const ch of sql) {
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === '?') {
      out += `$${++i}`;
    } else {
      out += ch;
    }
  }
  return out;
}

// mysql2-compatible result shape: `const [rows, meta] = await query(sql, params)`.
// mysql2 returned a ResultSetHeader as the first element for writes, so `const [r] = ...; r.affectedRows`
// must keep working: meta fields are also attached to the rows array (non-enumerable, so JSON stays clean).
// INSERTs that need the new id must use `RETURNING id`; `insertId` is then rows[0].id.
async function run(client, sql, params = []) {
  const res = await client.query(toPg(sql), params);
  // A multi-statement string (schema.sql) yields an array of results; report the last one.
  const r = Array.isArray(res) ? res[res.length - 1] : res;
  const rows = r?.rows ?? [];
  const meta = { affectedRows: r?.rowCount ?? 0, insertId: rows[0]?.id ?? null };
  Object.defineProperties(rows, {
    affectedRows: { value: meta.affectedRows },
    insertId: { value: meta.insertId },
  });
  return [rows, meta];
}

export const db = {
  query: (sql, params) => run(pool, sql, params),

  // Transaction handle with the same surface the routes already use.
  async getConnection() {
    const client = await pool.connect();
    return {
      query: (sql, params) => run(client, sql, params),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release(),
    };
  },

  end: () => pool.end(),
};

// Postgres unique-violation SQLSTATE (mysql2 exposed ER_DUP_ENTRY).
export const UNIQUE_VIOLATION = '23505';

export default db;
