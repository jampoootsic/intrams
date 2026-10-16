import { Router } from 'express';
import pool from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = Router();

let ensured = false;

// Make sure the settings table + default rows exist (self-healing for
// databases created before this feature — the manual db:init also handles it).
async function ensure() {
  if (ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(
    "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('scoring_locked', '0')"
  );
  ensured = true;
}

/** Read the global scoring-lock flag (cached per request by callers). */
export async function getScoringLocked() {
  await ensure();
  const [[row]] = await pool.query(
    "SELECT setting_value FROM settings WHERE setting_key = 'scoring_locked'"
  );
  return row ? String(row.setting_value) === '1' : false;
}

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
    await ensure();
    await pool.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('scoring_locked', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [locked ? '1' : '0']
    );
    return res.json({ locked });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

export default router;