import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'skills.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

let store = { skills: {}, meta: { lastSyncedAt: null } };

function load() {
  try {
    if (existsSync(DB_PATH)) {
      store = JSON.parse(readFileSync(DB_PATH, 'utf8'));
    }
  } catch { /* start fresh */ }
}

function save() {
  writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
}

load();

export function getAllSkills({ page = 1, limit = 50, source, q } = {}) {
  let skills = Object.values(store.skills);
  if (source) skills = skills.filter(s => s.source === source);
  if (q) {
    const lower = q.toLowerCase();
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(lower) ||
      (s.description || '').toLowerCase().includes(lower)
    );
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  const total = skills.length;
  const start = (page - 1) * limit;
  return {
    skills: skills.slice(start, start + limit).map(({ content, ...rest }) => rest),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  };
}

export function getSkill(name) {
  return store.skills[name] || null;
}

export function searchSkills(q, limit = 50) {
  if (!q) return [];
  const lower = q.toLowerCase();
  return Object.values(store.skills)
    .filter(s =>
      s.name.toLowerCase().includes(lower) ||
      (s.description || '').toLowerCase().includes(lower)
    )
    .slice(0, limit)
    .map(({ content, ...rest }) => rest);
}

export function getStats() {
  const skills = Object.values(store.skills);
  const bySource = {};
  for (const s of skills) {
    bySource[s.source] = (bySource[s.source] || 0) + 1;
  }
  return {
    total: skills.length,
    lastSyncedAt: store.meta.lastSyncedAt,
    bySource: Object.entries(bySource).map(([source, count]) => ({ source, count }))
  };
}

export function syncSkills(skills, deleted = []) {
  let upserted = 0;
  let removed = 0;
  for (const skill of skills) {
    if (skill.name) {
      const key = skill.source ? `${skill.source}:${skill.name}` : skill.name;
      store.skills[key] = {
        ...skill,
        updatedAt: new Date().toISOString()
      };
      upserted++;
    }
  }
  for (const name of deleted) {
    if (store.skills[name]) {
      delete store.skills[name];
      removed++;
    }
  }
  store.meta.lastSyncedAt = new Date().toISOString();
  save();
  return { upserted, removed, total: Object.keys(store.skills).length };
}
