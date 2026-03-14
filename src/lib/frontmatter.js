const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeScalar(value) {
  const trimmed = stripQuotes(String(value || '').trim());

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null') {
    return null;
  }

  return trimmed;
}

function normalizeArrayValue(rawValue) {
  const value = rawValue.trim();

  if (!value) {
    return [];
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((entry) => stripQuotes(entry.trim()))
      .filter(Boolean);
  }

  return value
    .split(',')
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean);
}

export function parseFrontmatter(markdown = '') {
  const match = markdown.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      frontmatter: {},
      body: markdown,
      rawFrontmatter: ''
    };
  }

  const rawFrontmatter = match[1];
  const body = markdown.slice(match[0].length);
  const frontmatter = {};
  const lines = rawFrontmatter.split(/\r?\n/);

  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.startsWith('- ') && currentKey) {
      const existing = Array.isArray(frontmatter[currentKey]) ? frontmatter[currentKey] : [];
      existing.push(normalizeScalar(trimmed.slice(2)));
      frontmatter[currentKey] = existing;
      continue;
    }

    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      currentKey = null;
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!key) {
      currentKey = null;
      continue;
    }

    if (!rawValue) {
      frontmatter[key] = [];
      currentKey = key;
      continue;
    }

    if (key === 'tags' || key === 'keywords') {
      frontmatter[key] = normalizeArrayValue(rawValue);
    } else {
      frontmatter[key] = normalizeScalar(rawValue);
    }

    currentKey = key;
  }

  return {
    frontmatter,
    body,
    rawFrontmatter
  };
}

export function firstMeaningfulParagraph(markdown = '') {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (
      line.startsWith('#') ||
      line.startsWith('>') ||
      line.startsWith('- ') ||
      line.startsWith('* ') ||
      line.startsWith('```') ||
      line === '---'
    ) {
      continue;
    }

    return line;
  }

  return '';
}

export function normalizeTags(frontmatter = {}, fallback = []) {
  const candidate = frontmatter.tags ?? frontmatter.keywords ?? fallback;

  if (Array.isArray(candidate)) {
    return [...new Set(candidate.map((tag) => String(tag).trim()).filter(Boolean))];
  }

  if (typeof candidate === 'string') {
    return [...new Set(candidate.split(',').map((tag) => tag.trim()).filter(Boolean))];
  }

  return [];
}
