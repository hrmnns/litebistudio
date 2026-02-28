import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includeExt = new Set(['.json', '.md', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.yml', '.yaml']);
const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'coverage']);

const allowlistedFiles = new Set([
  'CHANGELOG.md'
]);
const mojibakeNeedles = [
  'Ã',
  'Â',
  'ï¿½',
  'â€¢',
  'â€“',
  'â€”',
  'â€',
  '�S',
  '�x',
  '\u001e',
  '\u001c'
];

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) walk(full, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (includeExt.has(ext)) out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(root, p).split(path.sep).join('/');
}

function findNeedles(text, needles) {
  return needles.filter((needle) => text.includes(needle));
}

const files = walk(root);
const issues = [];

for (const file of files) {
  const relativePath = rel(file);
  if (allowlistedFiles.has(relativePath)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const hits = findNeedles(content, mojibakeNeedles);
  if (hits.length) {
    issues.push({
      file: relativePath,
      type: 'mojibake',
      details: `Found suspicious sequence(s): ${hits.join(', ')}`
    });
  }

  if (content.includes('\uFFFD') || content.includes('�')) {
    issues.push({
      file: relativePath,
      type: 'replacement-char',
      details: 'Found replacement character (U+FFFD), likely encoding corruption.'
    });
  }
}

// Validate locale JSON files explicitly
const localeDir = path.join(root, 'src', 'locales');
if (fs.existsSync(localeDir)) {
  for (const name of fs.readdirSync(localeDir)) {
    if (!name.endsWith('.json')) continue;
    const p = path.join(localeDir, name);
    const raw = fs.readFileSync(p, 'utf8');
    try {
      JSON.parse(raw);
    } catch (err) {
      issues.push({
        file: rel(p),
        type: 'json-parse',
        details: `Invalid JSON: ${String(err.message || err)}`
      });
    }
  }
}

if (issues.length) {
  console.error('Encoding check failed:\n');
  for (const i of issues) {
    console.error(`- [${i.type}] ${i.file}: ${i.details}`);
  }
  process.exit(1);
}

console.log('Encoding check passed.');
