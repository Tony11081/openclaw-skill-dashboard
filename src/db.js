import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { firstMeaningfulParagraph, normalizeTags, parseFrontmatter } from './lib/frontmatter.js';
import { sha256 } from './lib/hash.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'workspace',
    status TEXT NOT NULL DEFAULT 'ready',
    content TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    homepage TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    frontmatter TEXT NOT NULL DEFAULT '{}',
    tags TEXT NOT NULL DEFAULT '[]',
    hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_skills_source ON skills (source);
  CREATE INDEX IF NOT EXISTS idx_skills_status ON skills (status);
  CREATE INDEX IF NOT EXISTS idx_skills_name ON skills (name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_skills_updated_at ON skills (updated_at DESC);
`);

const listBase = `
  SELECT
    name,
    description,
    source,
    status,
    homepage,
    path,
    tags,
    hash,
    created_at AS createdAt,
    updated_at AS updatedAt,
    synced_at AS syncedAt
  FROM skills
`;

const getSkillStatement = db.prepare(`
  SELECT
    name,
    description,
    source,
    status,
    content,
    body,
    homepage,
    path,
    frontmatter,
    tags,
    hash,
    created_at AS createdAt,
    updated_at AS updatedAt,
    synced_at AS syncedAt
  FROM skills
  WHERE name = ?
  LIMIT 1
`);

const upsertStatement = db.prepare(`
  INSERT INTO skills (
    name,
    description,
    source,
    status,
    content,
    body,
    homepage,
    path,
    frontmatter,
    tags,
    hash,
    updated_at,
    synced_at
  ) VALUES (
    @name,
    @description,
    @source,
    @status,
    @content,
    @body,
    @homepage,
    @path,
    @frontmatter,
    @tags,
    @hash,
    @updatedAt,
    @syncedAt
  )
  ON CONFLICT(name) DO UPDATE SET
    description = excluded.description,
    source = excluded.source,
    status = excluded.status,
    content = excluded.content,
    body = excluded.body,
    homepage = excluded.homepage,
    path = excluded.path,
    frontmatter = excluded.frontmatter,
    tags = excluded.tags,
    hash = excluded.hash,
    updated_at = excluded.updated_at,
    synced_at = excluded.synced_at
`);

const deleteStatement = db.prepare('DELETE FROM skills WHERE name = ?');

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToSkill(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    frontmatter: safeParseJson(row.frontmatter, {}),
    tags: safeParseJson(row.tags, [])
  };
}

function buildWhereClause({ source, query }) {
  const clauses = [];
  const params = [];

  if (source) {
    clauses.push('source = ?');
    params.push(source);
  }

  if (query) {
    clauses.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)');
    const needle = `%${query.toLowerCase()}%`;
    params.push(needle, needle);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function normalizeSkill(skill) {
  const rawContent = typeof skill.content === 'string' ? skill.content : '';
  const parsed = parseFrontmatter(rawContent);
  const frontmatter = {
    ...parsed.frontmatter,
    ...(skill.frontmatter && typeof skill.frontmatter === 'object' ? skill.frontmatter : {})
  };
  const body = typeof skill.body === 'string' ? skill.body : parsed.body;
  const description =
    String(skill.description || frontmatter.description || firstMeaningfulParagraph(body) || '').trim();
  const tags = normalizeTags(frontmatter, skill.tags);
  const updatedAt = normalizeDate(skill.updatedAt);
  const contentHash =
    typeof skill.hash === 'string' && skill.hash
      ? skill.hash
      : sha256(JSON.stringify({
          content: rawContent,
          path: skill.path || '',
          source: skill.source || 'workspace'
        }));

  return {
    name: String(skill.name || frontmatter.name || '').trim(),
    description,
    source: String(skill.source || 'workspace').trim() || 'workspace',
    status: String(skill.status || frontmatter.status || (rawContent ? 'ready' : 'metadata-only')).trim(),
    content: rawContent,
    body,
    homepage: String(skill.homepage || frontmatter.homepage || frontmatter.url || '').trim(),
    path: String(skill.path || '').trim(),
    frontmatter: JSON.stringify(frontmatter),
    tags: JSON.stringify(tags),
    hash: contentHash,
    updatedAt,
    syncedAt: new Date().toISOString()
  };
}

export function listSkills({ page = 1, limit = 50, source = '', query = '' } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (safePage - 1) * safeLimit;
  const whereClause = buildWhereClause({ source, query });

  const rows = db
    .prepare(`${listBase} ${whereClause.where} ORDER BY updated_at DESC, name COLLATE NOCASE ASC LIMIT ? OFFSET ?`)
    .all(...whereClause.params, safeLimit, offset)
    .map(rowToSkill);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM skills ${whereClause.where}`)
    .get(...whereClause.params);

  return {
    data: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: totalRow?.total || 0,
      totalPages: Math.max(1, Math.ceil((totalRow?.total || 0) / safeLimit))
    }
  };
}

export function searchSkills({ q = '', page = 1, limit = 50, source = '' } = {}) {
  return listSkills({ page, limit, source, query: q.trim() });
}

export function getSkillByName(name) {
  return rowToSkill(getSkillStatement.get(name));
}

export function deleteSkills(names = []) {
  const runDelete = db.transaction((entries) => {
    let deleted = 0;

    for (const name of entries) {
      if (!name) {
        continue;
      }

      const result = deleteStatement.run(name);
      deleted += result.changes;
    }

    return deleted;
  });

  return runDelete(names);
}

export function upsertSkills(skills = []) {
  const runUpsert = db.transaction((entries) => {
    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      const normalized = normalizeSkill(entry);

      if (!normalized.name) {
        continue;
      }

      const existing = getSkillStatement.get(normalized.name);
      upsertStatement.run(normalized);

      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }

    return { inserted, updated };
  });

  return runUpsert(skills);
}

export function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS total FROM skills').get()?.total || 0;
  const lastSyncedAt =
    db.prepare('SELECT MAX(synced_at) AS lastSyncedAt FROM skills').get()?.lastSyncedAt || null;
  const bySource = db
    .prepare('SELECT source, COUNT(*) AS count FROM skills GROUP BY source ORDER BY count DESC, source ASC')
    .all();
  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS count FROM skills GROUP BY status ORDER BY count DESC, status ASC')
    .all();

  return {
    total,
    lastSyncedAt,
    bySource,
    byStatus
  };
}

export function countSkills() {
  return db.prepare('SELECT COUNT(*) AS total FROM skills').get()?.total || 0;
}
