import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth.js';
import { computeResults } from '../utils/compute.js';

const router = Router();

// Winners/results are sensitive — only admins may view them.
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const compId = Number(req.query.competition) || 1;
    const data = await computeResults(compId);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
});

export default router;