import { Router } from 'express';
import pool from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();

// Competitions (e.g. Mr. & Ms. Isidran Intramurals, Hiphop Dance).
// Judges only ever see their own competition; admins see all of them.
router.get('/', auth, async (req, res) => {
  if (!req.judge.is_admin) {
    // A judge is locked to their own competition — never expose the other events.
    if (!req.judge.competition_id) return res.json([]);
    const [rows] = await pool.query('SELECT * FROM competitions WHERE id = ?', [req.judge.competition_id]);
    return res.json(rows);
  }
  const [rows] = await pool.query('SELECT * FROM competitions ORDER BY sort_order ASC, id ASC');
  return res.json(rows);
});

export default router;