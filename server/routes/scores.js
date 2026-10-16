import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { getScoringLocked } from './settings.js';

const router = Router();

// When the admin has locked the system, judges can no longer write scores.
// Admins may still adjust scores and are the only ones able to unlock.
async function enforceUnlocked(req, res) {
  if (req.judge.is_admin) return true;
  if (await getScoringLocked()) {
    res.status(403).json({
      message: 'The scoring system is locked. Scores can no longer be changed.',
    });
    return false;
  }
  return true;
}

// A judge may only score segments belonging to the competition they were
// assigned to. Admins are system-wide and bypass this check.
async function judgeAllowedForSegment(judgeId, segmentId) {
  if (!judgeId || !segmentId) return false;
  const [[row]] = await pool.query(
    `SELECT j.is_admin, j.competition_id AS jc,
            (SELECT competition_id FROM segments WHERE id = ?) AS sc
     FROM judges j WHERE j.id = ?`,
    [segmentId, judgeId]
  );
  if (!row) return false;
  if (Number(row.is_admin) === 1) return true; // admins bypass
  if (row.sc == null) return false;
  return Number(row.jc) === Number(row.sc);
}

// All scores entered for a given judge + segment (grid loader).
// Admin may pass ?judgeId= to view/edit another judge's sheet.
router.get('/', auth, async (req, res) => {
  const segmentId = Number(req.query.segment);
  const judgeId = Number(req.query.judge);
  if (!segmentId) return res.status(400).json({ message: 'segment query is required.' });

  let effectiveJudge = req.judge.id;
  if (judgeId && req.judge.is_admin) effectiveJudge = judgeId;

  // A non-admin judge may only view scores for their own competition, and an
  // admin may only pull another judge's sheet if that judge belongs to the
  // same competition as the segment.
  if (!(await judgeAllowedForSegment(effectiveJudge, segmentId))) {
    return res.status(403).json({ message: 'This judge is not assigned to this competition.' });
  }

  const [crits] = await pool.query('SELECT id FROM criterias WHERE segment_id = ?', [segmentId]);
  const ids = crits.map((c) => c.id);
  if (ids.length === 0) return res.json({});

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT candidate_id, criteria_id, score FROM scores
     WHERE judge_id = ? AND criteria_id IN (${placeholders})`,
    [effectiveJudge, ...ids]
  );

  const map = {};
  rows.forEach((r) => {
    map[`${r.candidate_id}:${r.criteria_id}`] = Number(r.score);
  });
  return res.json({ scores: map });
});

// Resolve which judge's scores are being written.
// - A normal judge can only ever write their own scores.
// - An admin may write on behalf of a JUDGE (data-entry), but NEVER under an
//   administrator account (admins cannot hold scores).
async function resolveTargetJudge(req) {
  let judgeId = req.judge.id;
  if (req.body.judge_id && req.judge.is_admin) judgeId = Number(req.body.judge_id);

  // Admins are not allowed to hold/submit scores (even through impersonation).
  const [[target]] = await pool.query('SELECT is_admin FROM judges WHERE id = ?', [judgeId]);
  if (!target) {
    const err = new Error('Judge not found.');
    err.status = 404;
    throw err;
  }
  if (Number(target.is_admin) === 1) {
    const err = new Error('Administrators cannot enter scores.');
    err.status = 403;
    throw err;
  }
  return judgeId;
}

// Upsert (or delete when score is null/empty) a single score value.
router.put('/', auth, async (req, res) => {
  const { candidate_id, criteria_id, score } = req.body || {};

  try {
    if (!(await enforceUnlocked(req, res))) return;

    const judgeId = await resolveTargetJudge(req);

    if (!candidate_id || !criteria_id) return res.status(400).json({ message: 'candidate_id and criteria_id required.' });

    // Guard: the judge must belong to the competition this criterion is in.
    const [[crit]] = await pool.query('SELECT segment_id FROM criterias WHERE id = ?', [Number(criteria_id)]);
    if (!crit) return res.status(400).json({ message: 'Criterion not found.' });
    if (!(await judgeAllowedForSegment(judgeId, crit.segment_id))) {
      return res.status(403).json({ message: 'This judge is not assigned to the competition this criterion belongs to.' });
    }

    if (score == null || score === '') {
      await pool.query('DELETE FROM scores WHERE candidate_id=? AND judge_id=? AND criteria_id=?', [
        candidate_id, judgeId, criteria_id,
      ]);
      return res.json({ message: 'Score removed.' });
    }

    const num = Number(score);
    if (isNaN(num) || num < 0 || num > 100) {
      return res.status(400).json({ message: 'Score must be between 0 and 100.' });
    }

    await pool.query(
      `INSERT INTO scores (candidate_id, judge_id, criteria_id, score) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score)`,
      [candidate_id, judgeId, criteria_id, num]
    );
    return res.json({ ok: true });
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return res.status(status).json({ message: e.message });
  }
});

// Optional admin bulk-write endpoint (all scores for one segment in one shot).
router.post('/bulk', auth, adminOnly, async (req, res) => {
  const { judge_id, entries } = req.body || {}; // entries: [{candidate_id, criteria_id, score}]
  if (!judge_id || !Array.isArray(entries)) return res.status(400).json({ message: 'judge_id and entries required.' });

  // Guard: bulk writes may target a JUDGE only, never an administrator account.
  const [[target]] = await pool.query('SELECT is_admin FROM judges WHERE id = ?', [judge_id]);
  if (!target) return res.status(404).json({ message: 'Judge not found.' });
  if (Number(target.is_admin) === 1) {
    return res.status(403).json({ message: 'Administrators cannot enter scores.' });
  }

  // Guard: every entry must belong to a competition the judge is assigned to.
  const critIds = [...new Set(entries.map((e) => Number(e.criteria_id)))];
  if (critIds.length) {
    const ph = critIds.map(() => '?').join(',');
    const [crits] = await pool.query(`SELECT id, segment_id FROM criterias WHERE id IN (${ph})`, critIds);
    for (const crit of crits) {
      if (!(await judgeAllowedForSegment(judge_id, crit.segment_id))) {
        return res.status(403).json({ message: 'Judge is not assigned to one of the competitions in these entries.' });
      }
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const e of entries) {
      if (e.score == null || e.score === '') {
        await conn.query('DELETE FROM scores WHERE candidate_id=? AND judge_id=? AND criteria_id=?', [
          e.candidate_id, judge_id, e.criteria_id,
        ]);
      } else {
        const num = Number(e.score);
        if (isNaN(num) || num < 0 || num > 100) throw new Error('Score must be 0-100.');
        await conn.query(
          `INSERT INTO scores (candidate_id, judge_id, criteria_id, score) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE score = VALUES(score)`,
          [e.candidate_id, judge_id, e.criteria_id, num]
        );
      }
    }
    await conn.commit();
    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
});

// Reset ALL scores — requires the admin's own password as confirmation.
router.delete('/reset', auth, adminOnly, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ message: 'Admin password is required.' });

  // Verify the admin's password before touching anything.
  const [[admin]] = await pool.query(
    'SELECT password FROM judges WHERE id = ? AND is_admin = 1',
    [req.judge.id]
  );
  if (!admin || !bcrypt.compareSync(String(password), admin.password)) {
    return res.status(403).json({ message: 'Incorrect admin password. Reset cancelled.' });
  }

  const [result] = await pool.query('DELETE FROM scores');
  return res.json({
    message: `All scores have been reset (${result.affectedRows} score record(s) removed).`,
    deleted: result.affectedRows,
  });
});

export default router;