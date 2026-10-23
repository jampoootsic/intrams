import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool, { UNIQUE_VIOLATION } from '../db.js';
import { bumpVersion } from '../utils/version.js';
import { signToken, auth, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }
    const [rows] = await pool.query(
      `SELECT j.*, c.name AS competition_name, c.standalone AS competition_standalone, c.unit_type AS competition_unit_type
       FROM judges j
       LEFT JOIN competitions c ON c.id = j.competition_id
       WHERE j.username = ? LIMIT 1`,
      [username]
    );
    const judge = rows[0];
    if (!judge) return res.status(401).json({ message: 'Invalid credentials.' });
    const ok = bcrypt.compareSync(String(password), judge.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials.' });

    const token = signToken({ id: judge.id, username: judge.username, is_admin: !!judge.is_admin, competition_id: judge.competition_id });
    return res.json({
      token,
      user: {
        id: judge.id,
        name: judge.name,
        username: judge.username,
        is_admin: !!judge.is_admin,
        competition_id: judge.competition_id,
        competition_name: judge.competition_name,
        competition_standalone: judge.competition_standalone,
        competition_unit_type: judge.competition_unit_type,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT j.id, j.name, j.username, j.is_admin, j.competition_id, c.name AS competition_name,
              c.standalone AS competition_standalone, c.unit_type AS competition_unit_type
       FROM judges j
       LEFT JOIN competitions c ON c.id = j.competition_id
       WHERE j.id = ?`,
      [req.judge.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'User not found.' });
    return res.json({ user: rows[0] });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// Change own password (any logged-in user). Requires the current password.
router.put('/me/password', auth, async (req, res) => {
  const { current_password, password } = req.body || {};
  if (!current_password || !password) {
    return res.status(400).json({ message: 'Current and new password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters.' });
  }
  const [[row]] = await pool.query('SELECT password FROM judges WHERE id = ?', [req.judge.id]);
  if (!row || !bcrypt.compareSync(String(current_password), row.password)) {
    return res.status(403).json({ message: 'Current password is incorrect.' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  await pool.query('UPDATE judges SET password = ? WHERE id = ?', [hash, req.judge.id]);
  return res.json({ message: 'Password changed.' });
});

// ---- Judge management (admin) ----
// ?competition=<id> lists only the judges who belong to that competition.
router.get('/', auth, adminOnly, async (req, res) => {
  const compId = Number(req.query.competition) || null;
  const where = compId ? 'WHERE j.competition_id = ?' : '';
  const params = compId ? [compId] : [];
  const [rows] = await pool.query(
    `SELECT j.id, j.name, j.username, j.is_admin, j.competition_id, c.name AS competition_name
     FROM judges j
     LEFT JOIN competitions c ON c.id = j.competition_id
     ${where}
     ORDER BY j.is_admin DESC, j.name ASC`,
    params
  );
  res.json(rows);
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { name, username, password, competition_id } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ message: 'Name, username and password are required.' });
  const cid = competition_id == null ? null : Number(competition_id);
  const hash = bcrypt.hashSync(String(password), 10);
  try {
    await pool.query(
      'INSERT INTO judges (name, username, password, is_admin, competition_id) VALUES (?, ?, ?, 0, ?)',
      [name, username, hash, cid]
    );
    await bumpVersion();
    return res.json({ message: 'Judge created.' });
  } catch (e) {
    if (e.code === UNIQUE_VIOLATION) return res.status(409).json({ message: 'Username already taken.' });
    return res.status(500).json({ message: e.message });
  }
});

// Move a judge to another competition (or unassign with null).
router.put('/:id', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { competition_id } = req.body || {};
  const [[target]] = await pool.query('SELECT id, is_admin FROM judges WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ message: 'Judge not found.' });
  if (Number(target.is_admin) === 1) {
    return res.status(400).json({ message: 'Administrators are system-wide and cannot be assigned to a competition.' });
  }
  await pool.query('UPDATE judges SET competition_id = ? WHERE id = ?', [competition_id == null ? null : Number(competition_id), id]);
  await bumpVersion();
  return res.json({ message: 'Judge updated.' });
});

router.put('/:id/password', auth, adminOnly, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ message: 'New password is required.' });
  const hash = bcrypt.hashSync(String(password), 10);
  await pool.query('UPDATE judges SET password = ? WHERE id = ?', [hash, req.params.id]);
  await bumpVersion();
  return res.json({ message: 'Password updated.' });
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const [[row]] = await pool.query('SELECT id FROM judges WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ message: 'Judge not found.' });
  await pool.query('DELETE FROM judges WHERE id = ?', [id]);
  await bumpVersion();
  return res.json({ message: 'Judge deleted.' });
});

export default router;