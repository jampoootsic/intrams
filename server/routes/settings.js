import { Router } from 'express';
import pool from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { bumpVersion, getVersion } from '../utils/version.js';

const router = Router();

/** Read the global scoring-lock flag (cached per request by callers). */
export async function getScoringLocked() {
  const [[row]] = await pool.query(
    "SELECT setting_value FROM settings WHERE setting_key = 'scoring_locked'"
  );
  return row ? String(row.setting_value) === '1' : false;
}

// Change token polled by clients to detect data changes.
router.get('/version', auth, async (_req, res) => {
  try {
    return res.json({ version: await getVersion() });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// Current system status — authenticated judges/admins can read it so the UI
// can show the lock banner and disable inputs.
router.get('/system', auth, async (_req, res) => {
  try {
    return res.json({ locked: await getScoringLocked() });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// Lock / unlock scoring — administrators only.
router.put('/system', auth, adminOnly, async (req, res) => {
  try {
    const locked = !!(req.body || {}).locked;
    await pool.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('scoring_locked', ?)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
      [locked ? '1' : '0']
    );
    await bumpVersion();
    return res.json({ locked });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

export default router;
