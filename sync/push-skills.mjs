import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, firstMeaningfulParagraph, normalizeTags } from '../src/lib/frontmatter.js';
import { sha256 } from '../src/lib/hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cachePath = path.join(__dirname, '.push-cache.json');

const scanRoots = [
  { source: 'workspace', directory: '~/clawd/skills' },
  { source: 'agents', directory: '~/.agents/skills' },
  { source: 'bundled', directory: '~/.npm-global/lib/node_modules/openclaw/skills' },
  { source: 'extensions', directory: '~/.openclaw/extensions' }
];

function expandHome(value) {
  return value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function walkForSkillFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const skillFiles = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      skillFiles.push(...(await walkForSkillFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name === 'SKILL.md') {
      skillFiles.push(fullPath);
    }
  }

  return skillFiles;
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectSkills() {
  const results = [];

  for (const root of scanRoots) {
    const absoluteRoot = expandHome(root.directory);
    if (!(await fileExists(absoluteRoot))) {
      continue;
    }

    const skillFiles = await walkForSkillFiles(absoluteRoot);

    for (const filePath of skillFiles) {
      const rawContent = await fs.readFile(filePath, 'utf8');
      const parsed = parseFrontmatter(rawContent);
      const stats = await fs.stat(filePath);
      const directoryName = path.basename(path.dirname(filePath));
      const frontmatter = parsed.frontmatter || {};
      const name = String(frontmatter.name || directoryName).trim();
      const description = String(frontmatter.description || firstMeaningfulParagraph(parsed.body) || '').trim();
      const tags = normalizeTags(frontmatter);
      const payloadHash = sha256(JSON.stringify({
        source: root.source,
        path: filePath,
        content: rawContent
      }));

      results.push({
        key: `${root.source}:${name}`,
        name,
        description,
        source: root.source,
        content: rawContent,
        body: parsed.body,
        frontmatter,
        homepage: String(frontmatter.homepage || frontmatter.url || '').trim(),
        path: filePath,
        updatedAt: stats.mtime.toISOString(),
        tags,
        status: String(frontmatter.status || 'ready').trim(),
        hash: payloadHash
      });
    }
  }

  return results.sort((left, right) => left.name.localeCompare(right.name));
}

function usage() {
  console.log('Usage: node sync/push-skills.mjs --api-url https://skills.example.com --sync-key SECRET');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const apiUrl = String(args['api-url'] || process.env.API_URL || '').trim().replace(/\/$/, '');
  const syncKey = String(args['sync-key'] || process.env.SYNC_KEY || '').trim();

  if (!apiUrl || !syncKey) {
    usage();
    throw new Error('Both --api-url and --sync-key are required.');
  }

  const cache = await readJson(cachePath, { hashes: {} });
  const skills = await collectSkills();
  const nextHashes = {};
  const changedSkills = [];

  for (const skill of skills) {
    nextHashes[skill.key] = skill.hash;

    if (cache.hashes?.[skill.key] !== skill.hash) {
      changedSkills.push(skill);
    }
  }

  const deleted = Object.keys(cache.hashes || {})
    .filter((key) => !(key in nextHashes))
    .map((key) => key.split(':').slice(1).join(':'));

  if (!changedSkills.length && !deleted.length) {
    console.log('No skill changes detected.');
    return;
  }

  console.log(`Pushing ${changedSkills.length} changed skills and ${deleted.length} deletions to ${apiUrl}`);

  const response = await fetch(`${apiUrl}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Key': syncKey
    },
    body: JSON.stringify({
      skills: changedSkills.map(({ key, ...skill }) => skill),
      deleted,
      fullSync: false,
      meta: {
        scannedAt: new Date().toISOString(),
        scannedCount: skills.length,
        changedCount: changedSkills.length,
        deletedCount: deleted.length
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sync failed with ${response.status}: ${text}`);
  }

  const payload = await response.json();
  await fs.writeFile(cachePath, JSON.stringify({ hashes: nextHashes, updatedAt: new Date().toISOString() }, null, 2));
  console.log('Sync complete:', payload);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
