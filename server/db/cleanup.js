import pool from '../db.js';

await pool.query('DELETE FROM scores');
await pool.query('DELETE FROM candidates');
await pool.query('DELETE FROM judges WHERE is_admin = 0');
const [j] = await pool.query('SELECT id, username, is_admin FROM judges');
const [seg] = await pool.query('SELECT code, final_weight FROM segments ORDER BY sort_order');
console.log('Judges left:', JSON.stringify(j));
console.log('Segments:', JSON.stringify(seg));
console.log('Cleanup done - DB is pristine (admin + seeded criteria remain).');
process.exit(0);