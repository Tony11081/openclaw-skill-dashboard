import express from 'express';
import { marked } from 'marked';
import { getSkillByName, listSkills, searchSkills } from '../db.js';

const router = express.Router();

router.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({
      error: 'Query parameter q is required.'
    });
  }

  const result = searchSkills({
    q: query,
    page: req.query.page,
    limit: req.query.limit,
    source: String(req.query.source || '').trim()
  });

  return res.json({
    query,
    ...result
  });
});

router.get('/', (req, res) => {
  const result = listSkills({
    page: req.query.page,
    limit: req.query.limit,
    source: String(req.query.source || '').trim()
  });

  return res.json(result);
});

router.get('/:name/raw', (req, res) => {
  const skill = getSkillByName(req.params.name);

  if (!skill) {
    return res.status(404).type('text/plain').send('Skill not found');
  }

  return res.type('text/markdown; charset=utf-8').send(skill.content);
});

router.get('/:name', (req, res) => {
  const skill = getSkillByName(req.params.name);

  if (!skill) {
    return res.status(404).json({
      error: 'Skill not found.'
    });
  }

  const includeRendered = ['1', 'true', 'html'].includes(String(req.query.render || '').toLowerCase());

  return res.json({
    ...skill,
    ...(includeRendered ? { renderedHtml: marked.parse(skill.body || skill.content || '') } : {})
  });
});

export default router;
