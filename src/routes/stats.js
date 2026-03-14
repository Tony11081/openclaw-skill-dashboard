import express from 'express';
import { getStats } from '../db.js';

const router = express.Router();

router.get('/', (_req, res) => {
  return res.json(getStats());
});

export default router;
