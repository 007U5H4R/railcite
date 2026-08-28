import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ENVS = ['ANTHROPIC_API_KEY','VOYAGE_API_KEY','NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DB_URL',
  'NEXT_PUBLIC_MIXPANEL_TOKEN','NEXT_PUBLIC_SITE_URL'];
const BINS = ['pdftotext','pdftoppm','tesseract','psql','python3'];

function has(bin: string) { try { execSync(`command -v ${bin}`, {stdio:'ignore'}); return true; } catch { return false; } }
// Load .env.local without a dependency
import { readFileSync } from 'node:fs';
try {
  for (const line of readFileSync('.env.local','utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local yet */ }

console.log('— env —');
for (const e of ENVS) console.log(`${process.env[e] ? '✓' : '✗'} ${e}`);
console.log('— binaries —');
for (const b of BINS) console.log(`${has(b) ? '✓' : '✗'} ${b}`);
const dataDir = path.resolve(process.env.DATA_DIR ?? '../Data');
console.log('— data —');
console.log(`${existsSync(dataDir) ? '✓' : '✗'} DATA_DIR at ${dataDir}`);
console.log('\nInstall binaries: brew install poppler tesseract libpq && brew link --force libpq');
