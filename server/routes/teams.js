import { Router } from 'express';
import pool from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = Router();

// All teams for a competition (with member counts) - visible to any authenticated user.
router.get('/', auth, async (req, res) => {
  const compId = req.judge.is_admin ? Number(req.query.competition) || 1 : req.judge.competition_id || 1;
  const [rows] = await pool.query(
    `SELECT t.*, COUNT(c.id) AS member_count
     FROM teams t
     LEFT JOIN candidates c ON c.team_id = t.id AND c.competition_id = t.competition_id
     WHERE t.competition_id = ?
     GROUP BY t.id
     ORDER BY t.sort_order ASC, t.name ASC`,
    [compId]
  );
  rows.forEach((r) => (r.member_count = Number(r.member_count)));
  return res.json(rows);
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { name, color, competition_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: 'Team name is required.' });
  const cleanColor = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#14213d';
  const cid = Number(competition_id) || 1;
  try {
    const [r] = await pool.query(
      'INSERT INTO teams (competition_id, name, color, sort_order) VALUES (?, ?, ?, ?)',
      [cid, name.trim(), cleanColor, await nextSortOrder(cid)]
    );
    return res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A team with that name already exists in this competition.' });
    return res.status(500).json({ message: e.message });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { name, color, sort_order } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: 'Team name is required.' });
  const cleanColor = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
  const sets = ['name = ?'];
  const vals = [name.trim()];
  if (cleanColor) { sets.push('color = ?'); vals.push(cleanColor); }
  if (sort_order != null) { sets.push('sort_order = ?'); vals.push(Number(sort_order)); }
  vals.push(id);
  try {
    await pool.query(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`, vals);
    return res.json({ message: 'Team updated.' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A team with that name already exists.' });
    return res.status(500).json({ message: e.message });
  }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const [[row]] = await pool.query('SELECT id FROM teams WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ message: 'Team not found.' });
  // Detach candidates first (FK is SET NULL anyway, but be explicit + clear scores are kept).
  await pool.query('UPDATE candidates SET team_id = NULL WHERE team_id = ?', [id]);
  await pool.query('DELETE FROM teams WHERE id = ?', [id]);
  return res.json({ message: 'Team deleted. Its candidates are now unassigned.' });
});

async function nextSortOrder(competitionId) {
  const [[row]] = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM teams WHERE competition_id = ?', [competitionId]);
  return row.n;
}

export default router;