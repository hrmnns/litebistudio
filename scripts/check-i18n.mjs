import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const localeDir = path.join(root, 'src', 'locales');

function flattenKeys(value, prefix = '', out = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenKeys(entry, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flattenKeys(v, next, out);
    }
    return out;
  }
  out.set(prefix, value);
  return out;
}

function readLocale(name) {
  const p = path.join(localeDir, name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const baseName = 'en.json';
const compareName = 'de.json';
const base = readLocale(baseName);
const compare = readLocale(compareName);

const baseKeys = flattenKeys(base);
const compareKeys = flattenKeys(compare);

const missingInCompare = Array.from(baseKeys.keys()).filter((k) => !compareKeys.has(k));
const missingInBase = Array.from(compareKeys.keys()).filter((k) => !baseKeys.has(k));
const typeMismatches = [];

for (const key of baseKeys.keys()) {
  if (!compareKeys.has(key)) continue;
  const t1 = typeof baseKeys.get(key);
  const t2 = typeof compareKeys.get(key);
  if (t1 !== t2) typeMismatches.push(`${key}: ${t1} vs ${t2}`);
}

if (missingInCompare.length || missingInBase.length || typeMismatches.length) {
  console.error('i18n key check failed:\n');
  if (missingInCompare.length) {
    console.error(`- Missing in ${compareName} (${missingInCompare.length}):`);
    missingInCompare.slice(0, 50).forEach((k) => console.error(`  - ${k}`));
  }
  if (missingInBase.length) {
    console.error(`- Missing in ${baseName} (${missingInBase.length}):`);
    missingInBase.slice(0, 50).forEach((k) => console.error(`  - ${k}`));
  }
  if (typeMismatches.length) {
    console.error(`- Type mismatches (${typeMismatches.length}):`);
    typeMismatches.slice(0, 50).forEach((msg) => console.error(`  - ${msg}`));
  }
  process.exit(1);
}

console.log(`i18n key check passed (${baseKeys.size} keys compared: ${baseName} vs ${compareName}).`);

