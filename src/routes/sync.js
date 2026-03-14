import express from 'express';
import { syncSkills } from '../db.js';

const router = express.Router();

router.post('/', (req, res) => {
  const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
  const deleted = Array.isArray(req.body?.deleted) ? req.body.deleted.filter(Boolean) : [];

  if (!skills.length && !deleted.length) {
    return res.status(400).json({ error: 'No skills or deletions provided.' });
  }

  const result = syncSkills(skills, deleted);
  return res.json({
    ok: true,
    ...result,
    meta: req.body?.meta || null
  });
});

export default router;
