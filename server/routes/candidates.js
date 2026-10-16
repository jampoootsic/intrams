import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import pool from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `cand-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

// iPhone/Android cameras report HEIC/HEIF; some tools send 'image/jpg' or BMP.
const ALLOWED = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/bmp',
];
const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15 MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_PHOTO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, GIF, WEBP, HEIC or BMP images are allowed.'));
  },
});

function publicUrl(photoFile) {
  return photoFile ? `/uploads/${encodeURIComponent(photoFile)}` : null;
}

function deleteFile(filename) {
  if (!filename) return;
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(filename)));
  } catch { /* file already gone */ }
}

// Attach each candidate's per-exposure photos as a map:
//   segment_photos = { [segment_id]: { photo, photo_url } }
async function attachSegmentPhotos(candidates) {
  candidates.forEach((c) => { c.segment_photos = {}; });
  if (!candidates.length) return;
  const ids = candidates.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT candidate_id, segment_id, photo FROM candidate_photos WHERE candidate_id IN (${placeholders})`,
    ids
  );
  rows.forEach((r) => {
    const c = candidates.find((x) => x.id === r.candidate_id);
    if (c) c.segment_photos[String(r.segment_id)] = { photo: r.photo, photo_url: publicUrl(r.photo) };
  });
}

router.get('/', auth, async (req, res) => {
  const compId = req.judge.is_admin ? Number(req.query.competition) || 1 : req.judge.competition_id || 1;
  const [rows] = await pool.query(
    `SELECT c.*, t.name AS team_name, t.color AS team_color
     FROM candidates c
     LEFT JOIN teams t ON t.id = c.team_id
     WHERE c.competition_id = ?
     ORDER BY c.active DESC, c.gender ASC, c.candidate_no ASC`,
    [compId]
  );
  rows.forEach((r) => {
    r.photo_url = publicUrl(r.photo);
  });
  await attachSegmentPhotos(rows);
  return res.json(rows);
});

// Standalone competitions (e.g. Hiphop) score dance GROUPS: one per team, no gender.
// Other standalone competitions (e.g. Solo Singing) score individual soloists.
async function competitionMode(competitionId) {
  const [[c]] = await pool.query('SELECT standalone, unit_type FROM competitions WHERE id = ?', [competitionId]);
  return c || null;
}

router.post('/', auth, adminOnly, async (req, res) => {
  const { candidate_no, first_name, last_name, gender, active, team_id, competition_id, group_name } = req.body || {};
  if (!candidate_no) {
    return res.status(400).json({ message: 'Candidate number is required.' });
  }
  const cid = Number(competition_id) || 1;
  const mode = await competitionMode(cid);
  const standalone = !!(mode && Number(mode.standalone) === 1);
  const isGroup = standalone && mode.unit_type === 'group';
  let fn = first_name, ln = last_name, gnd = gender, gn = null;
  let tid = team_id ? Number(team_id) : null;

  if (isGroup) {
    // Group entry: must belong to a team and have a group name; no gender.
    if (!tid) return res.status(400).json({ message: 'A team is required for a group entry.' });
    if (!group_name || !group_name.trim()) return res.status(400).json({ message: 'Group name is required.' });
    gn = String(group_name).trim();
    fn = null; ln = null; gnd = null;
    const [[dup]] = await pool.query(
      'SELECT id FROM candidates WHERE competition_id = ? AND team_id = ? AND active = 1 LIMIT 1',
      [cid, tid]
    );
    if (dup) return res.status(409).json({ message: 'This team already has a group in this competition (one group per team).' });
  } else if (standalone) {
    // Solo individual: named contestant, no gender.
    if (!first_name || !last_name) return res.status(400).json({ message: 'First name and last name are required.' });
    fn = String(first_name).trim(); ln = String(last_name).trim();
    gnd = null; gn = null;
  } else if (!first_name || !last_name || !gender) {
    return res.status(400).json({ message: 'First name, last name and gender are required.' });
  }

  try {
    const [r] = await pool.query(
      `INSERT INTO candidates (competition_id, candidate_no, first_name, last_name, gender, group_name, team_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, candidate_no, fn, ln, gnd, gn, tid, active === undefined ? 1 : active ? 1 : 0]
    );
    return res.status(201).json({ id: r.insertId });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { candidate_no, first_name, last_name, gender, active, team_id, group_name } = req.body || {};
  if (!candidate_no) {
    return res.status(400).json({ message: 'Candidate number is required.' });
  }
  const [[cand]] = await pool.query('SELECT competition_id FROM candidates WHERE id = ?', [id]);
  if (!cand) return res.status(404).json({ message: 'Candidate not found.' });

  const mode = await competitionMode(cand.competition_id);
  const standalone = !!(mode && Number(mode.standalone) === 1);
  const isGroup = standalone && mode.unit_type === 'group';
  let fn = first_name, ln = last_name, gnd = gender, gn = null;
  let tid = team_id ? Number(team_id) : null;

  if (isGroup) {
    if (!tid) return res.status(400).json({ message: 'A team is required for a group entry.' });
    if (!group_name || !group_name.trim()) return res.status(400).json({ message: 'Group name is required.' });
    gn = String(group_name).trim();
    fn = null; ln = null; gnd = null;
    const [[dup]] = await pool.query(
      'SELECT id FROM candidates WHERE competition_id = ? AND team_id = ? AND active = 1 AND id != ? LIMIT 1',
      [cand.competition_id, tid, id]
    );
    if (dup) return res.status(409).json({ message: 'This team already has a group in this competition (one group per team).' });
  } else if (standalone) {
    if (!first_name || !last_name) return res.status(400).json({ message: 'First name and last name are required.' });
    fn = String(first_name).trim(); ln = String(last_name).trim();
    gnd = null; gn = null;
  } else if (!first_name || !last_name || !gender) {
    return res.status(400).json({ message: 'First name, last name and gender are required.' });
  }

  try {
    await pool.query(
      `UPDATE candidates SET candidate_no = ?, first_name = ?, last_name = ?, gender = ?, group_name = ?, team_id = ?, active = ? WHERE id = ?`,
      [candidate_no, fn, ln, gnd, gn, tid, active ? 1 : 0, id]
    );
    return res.json({ message: 'Candidate updated.' });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  // Remove photo file(s) before deleting the record.
  const id = Number(req.params.id);
  const [[row]] = await pool.query('SELECT photo FROM candidates WHERE id = ?', [id]);
  if (row && row.photo) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(row.photo)));
    } catch { /* file already gone */ }
  }
  const [segRows] = await pool.query('SELECT photo FROM candidate_photos WHERE candidate_id = ?', [id]);
  segRows.forEach((r) => deleteFile(r.photo));
  await pool.query('DELETE FROM candidates WHERE id = ?', [id]);
  return res.json({ message: 'Candidate deleted.' });
});

// --- Photo upload / replace ---
// multer's middleware is wrapped so its errors (e.g. file too large) are returned
// as a friendly JSON message instead of Express's default HTML error page.
router.post('/:id/photo', auth, adminOnly, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    // If multipart parsing errored partway, clean up the (partial) file that was written.
    if (err && req.file) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }

    if (err) {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? `Photo is too large. Maximum allowed size is ${MAX_PHOTO_SIZE / (1024 * 1024)} MB.`
            : err.message;
        return res.status(400).json({ message: msg });
      }
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
      return res.status(400).json({ message: err.message });
    }

    try {
      if (!req.file) return res.status(400).json({ message: 'No photo file provided (field name: photo).' });

      const id = Number(req.params.id);
      const [[row]] = await pool.query('SELECT id, photo FROM candidates WHERE id = ?', [id]);
      if (!row) {
        deleteFile(req.file.filename);
        return res.status(404).json({ message: 'Candidate not found.' });
      }

      const newFile = req.file.filename;
      const segmentId = req.body.segment_id ? Number(req.body.segment_id) : null;

      // Per-exposure photo: store in candidate_photos (one per segment).
      if (segmentId) {
        const [[seg]] = await pool.query('SELECT id FROM segments WHERE id = ?', [segmentId]);
        if (!seg) {
          deleteFile(newFile);
          return res.status(400).json({ message: 'Selected exposure does not exist.' });
        }
        const [[existing]] = await pool.query(
          'SELECT photo FROM candidate_photos WHERE candidate_id = ? AND segment_id = ?',
          [id, segmentId]
        );
        if (existing && existing.photo !== newFile) deleteFile(existing.photo);
        if (existing) {
          await pool.query(
            'UPDATE candidate_photos SET photo = ? WHERE candidate_id = ? AND segment_id = ?',
            [newFile, id, segmentId]
          );
        } else {
          await pool.query(
            'INSERT INTO candidate_photos (candidate_id, segment_id, photo) VALUES (?, ?, ?)',
            [id, segmentId, newFile]
          );
        }
        return res.json({ photo: newFile, photo_url: publicUrl(newFile), segment_id: segmentId });
      }

      // Replace and delete the old main photo.
      if (row.photo && row.photo !== newFile) deleteFile(row.photo);

      await pool.query('UPDATE candidates SET photo = ? WHERE id = ?', [newFile, id]);
      return res.json({ photo: newFile, photo_url: publicUrl(newFile) });
    } catch (e) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
      return res.status(500).json({ message: e.message });
    }
  });
});

// --- Remove photo (main, or a segment's photo via ?segment_id=) ---
router.delete('/:id/photo', auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const segmentId = req.query.segment_id ? Number(req.query.segment_id) : null;

  // Remove a segment-specific photo.
  if (segmentId) {
    const [[row]] = await pool.query(
      'SELECT photo FROM candidate_photos WHERE candidate_id = ? AND segment_id = ?',
      [id, segmentId]
    );
    if (row) {
      deleteFile(row.photo);
      await pool.query('DELETE FROM candidate_photos WHERE candidate_id = ? AND segment_id = ?', [id, segmentId]);
    }
    return res.json({ message: 'Photo removed.' });
  }

  const [[row]] = await pool.query('SELECT photo FROM candidates WHERE id = ?', [id]);
  if (row && row.photo) {
    deleteFile(row.photo);
    await pool.query('UPDATE candidates SET photo = NULL WHERE id = ?', [id]);
  }
  return res.json({ message: 'Photo removed.' });
});

export default router;