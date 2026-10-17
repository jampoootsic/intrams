import db from '../db.js';

try {
  await db.query('DELETE FROM scores');
  await db.query('DELETE FROM candidates');
  await db.query('DELETE FROM judges WHERE is_admin = 0');
  const [j] = await db.query('SELECT id, username, is_admin FROM judges');
  const [seg] = await db.query('SELECT code, final_weight FROM segments ORDER BY sort_order');
  console.log('Judges left:', JSON.stringify(j));
  console.log('Segments:', JSON.stringify(seg));
  console.log('Cleanup done - DB is pristine (admin + seeded criteria remain).');
} finally {
  await db.end();
}
