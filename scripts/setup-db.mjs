import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const sql = neon(process.env.DATABASE_URL || vars.DATABASE_URL);
const statements = readFileSync('schema.sql', 'utf8').split(';').map(s => s.trim()).filter(Boolean);
for (const s of statements) await sql.query(s);
console.log('Tablolar hazır.');
