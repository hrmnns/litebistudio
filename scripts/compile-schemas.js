import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const schemaPath = path.resolve(__dirname, '../src/schemas/invoice-items-schema.json');
const outDir = path.resolve(__dirname, '../src/lib/validators');
const outFile = path.join(outDir, 'invoice-items-validator.js');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// Load Schema
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
const schema = JSON.parse(schemaContent);

// Initialize Ajv with secure settings (code generation)
const ajv = new Ajv2020({
    code: {
        source: true,
        esm: true,
        lines: true
    },
    allErrors: true,
    useDefaults: true
});

addFormats(ajv);

// Compile
const validate = ajv.compile(schema);
let moduleCode = standaloneCode(ajv, validate);

// Patch: Replace CommonJS require with ESM imports for Vite compatibility
// 1. Handle ajv-formats
moduleCode = moduleCode.replace(
    /const (\w+) = require\("ajv-formats\/dist\/formats"\).fullFormats.date;/g,
    'import { fullFormats } from "ajv-formats/dist/formats.js"; const $1 = fullFormats.date;'
);

// 2. Handle ajv runtime (ucs2length)
moduleCode = moduleCode.replace(
    /const (\w+) = require\("ajv\/dist\/runtime\/ucs2length"\).default;/g,
    'import ucs2length from "ajv/dist/runtime/ucs2length.js"; const $1 = ucs2length;'
);

// 3. Handle generic require (catch-all for other runtime deps if any)
// Note: This is risky if strict CJS, but AJV runtime usually exports default
moduleCode = moduleCode.replace(
    /const (\w+) = require\("([^"]+)"\).default;/g,
    'import $1_pkg from "$2.js"; const $1 = $1_pkg;'
);

// Write to file
fs.writeFileSync(outFile, moduleCode);

console.log(`✅ Schema compiled to ${outFile}`);
