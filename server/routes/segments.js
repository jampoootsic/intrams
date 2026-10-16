import { Router } from 'express';
import pool from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = Router();

// Full segment + criteria structure for ONE competition.
// - Admins pass ?competition= (defaults to the first competition).
// - Judges only ever see the segments of their own competition.
router.get('/', auth, async (req, res) => {
  const compId = Number(req.query.competition) || null;
  let scope = null;
  if (!req.judge.is_admin) {
    if (!req.judge.competition_id) return res.json([]);
    scope = req.judge.competition_id; // judges are locked to their competition
  } else if (compId) {
    scope = compId;
  } else {
    const [[first]] = await pool.query('SELECT id FROM competitions ORDER BY sort_order ASC, id ASC LIMIT 1');
    scope = first ? first.id : null;
  }

  const [segments] = await pool.query(
    'SELECT s.*, c.name AS competition_name FROM segments s LEFT JOIN competitions c ON c.id = s.competition_id WHERE s.competition_id = ? ORDER BY s.sort_order ASC',
    [scope]
  );
  const [criterias] = await pool.query('SELECT * FROM criterias ORDER BY segment_id ASC, sort_order ASC');

  const segMap = segments.map((s) => ({
    ...s,
    criterias: criterias.filter((c) => c.segment_id === s.id),
  }));
  return res.json(segMap);
});

// Update a segment's final weight (admin).
router.put('/:id', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { final_weight } = req.body || {};
  if (final_weight == null || isNaN(Number(final_weight))) {
    return res.status(400).json({ message: 'Invalid final weight.' });
  }
  await pool.query('UPDATE segments SET final_weight = ? WHERE id = ?', [final_weight, id]);
  return res.json({ message: 'Segment updated.' });
});

// Update a criterion's weight or name (admin).
router.put('/criteria/:id', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { weight, name } = req.body || {};
  if (weight != null && isNaN(Number(weight))) return res.status(400).json({ message: 'Invalid weight.' });
  if (weight == null && !name) return res.status(400).json({ message: 'Nothing to update.' });
  const sets = [];
  const vals = [];
  if (weight != null) { sets.push('weight = ?'); vals.push(weight); }
  if (name) { sets.push('name = ?'); vals.push(name); }
  vals.push(id);
  await pool.query(`UPDATE criterias SET ${sets.join(', ')} WHERE id = ?`, vals);
  return res.json({ message: 'Criterion updated.' });
});

export default router;