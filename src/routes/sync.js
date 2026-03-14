import express from 'express';
import { deleteSkills, upsertSkills } from '../db.js';

const router = express.Router();

function normalizeDeletedNames(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

function handleSync(req, res) {
  const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
  const deleted = normalizeDeletedNames(req.body?.deleted);

  if (!skills.length && !deleted.length) {
    return res.status(400).json({
      error: 'Request must include at least one changed skill or deleted name.'
    });
  }

  const upsertSummary = upsertSkills(skills);
  const deletedCount = deleteSkills(deleted);

  return res.json({
    ok: true,
    received: skills.length,
    deleted: deletedCount,
    fullSync: Boolean(req.body?.fullSync),
    summary: upsertSummary,
    meta: req.body?.meta || null
  });
}

router.post('/', handleSync);

router.post('/incremental', (req, res) => {
  req.body = {
    ...req.body,
    fullSync: false
  };

  return handleSync(req, res);
});

export default router;
