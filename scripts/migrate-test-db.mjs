// scripts/migrate-test-db.mjs — Deploy Prisma migrations to TEST_DATABASE_URL
// Safely deploys migrations to TEST_DATABASE_URL (Supabase PostgreSQL).
// NEVER prints password, full connection string, or secrets.

import { createRequire } from 'module';
import { execSync } from 'child_process';

// Load .env before importing anything that reads env vars.
const require = createRequire(import.meta.url);
require('dotenv').config();

// ── 1. Read and trim TEST_DATABASE_URL ───────────────────────────────────────
const rawUrl = (process.env.TEST_DATABASE_URL ?? '').trim();

if (!rawUrl) {
  console.error(
    'ERROR: TEST_DATABASE_URL is not set or is empty in .env.\n' +
    'Set TEST_DATABASE_URL in .env and try again.'
  );
  process.exit(1);
}

// ── 2. Safe URL parser (same proven logic as db-identity.mjs) ────────────────
function parseSafeDbUrl(connStr) {
  const withoutProto = connStr.replace(/^postgres(?:ql)?:\/\//, '');

  // The LAST '@' separates credentials from host (handles '@' in passwords)
  const lastAt = withoutProto.lastIndexOf('@');

  let username = '<unknown>';
  let password = '';
  let hostPart = withoutProto;

  if (lastAt !== -1) {
    const credentials = withoutProto.slice(0, lastAt); // "user:pass"
    hostPart = withoutProto.slice(lastAt + 1);         // "host:port/db?opts"
    const colonIdx = credentials.indexOf(':');
    username = colonIdx !== -1 ? credentials.slice(0, colonIdx) : credentials;
    password = colonIdx !== -1 ? credentials.slice(colonIdx + 1) : '';
  }

  // Remove query string before splitting host/db
  const parts = hostPart.split('?');
  const hostAndDb = parts[0];
  const queryString = parts[1] ?? '';
  const slashIdx = hostAndDb.indexOf('/');
  const hostPort = slashIdx !== -1 ? hostAndDb.slice(0, slashIdx) : hostAndDb;
  const dbName   = slashIdx !== -1 ? hostAndDb.slice(slashIdx + 1) : 'postgres';

  const colonIdx = hostPort.lastIndexOf(':');
  const hostname = colonIdx !== -1 ? hostPort.slice(0, colonIdx) : hostPort;
  const port     = colonIdx !== -1 ? hostPort.slice(colonIdx + 1) : '5432';

  return { username, password, hostname, port, dbName, queryString };
}

const parsed = parseSafeDbUrl(rawUrl);

// ── 3. Build percent-encoded URL for Prisma ─────────────────────────────────
function buildEncodedUrl(p) {
  const encodedPass = encodeURIComponent(p.password);
  const qs = p.queryString ? `?${p.queryString}` : '';
  return `postgresql://${p.username}:${encodedPass}@${p.hostname}:${p.port}/${p.dbName}${qs}`;
}

const encodedUrl = buildEncodedUrl(parsed);

// ── 4. Safety check against local database target ────────────────────────────
const isLocalhost =
  parsed.hostname === 'localhost' ||
  parsed.hostname === '127.0.0.1' ||
  parsed.hostname === '::1';

if (isLocalhost) {
  console.error(
    `REFUSING TO RUN: Target hostname is local (${parsed.hostname}).\n` +
    'This script is specifically intended to deploy migrations to TEST_DATABASE_URL (Supabase/remote).'
  );
  process.exit(1);
}

// ── 5. Safe Target Info Display ──────────────────────────────────────────────
console.log('=== PRISMA MIGRATE DEPLOY TO TEST_DATABASE_URL ===');
console.log('Target Host     :', parsed.hostname);
console.log('Target Port     :', parsed.port);
console.log('Target DB Name  :', parsed.dbName);
console.log('Target User     :', parsed.username);
console.log('Target Identity :', 'TEST_DATABASE_URL / Supabase Cloud');
console.log('--------------------------------------------------');

// ── 6. Execute Prisma Migrate Deploy ────────────────────────────────────────
try {
  const env = {
    ...process.env,
    DATABASE_URL: encodedUrl,
  };

  console.log('Executing: npx prisma migrate deploy --schema prisma/schema.prisma');
  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    stdio: 'inherit',
    env,
  });
  console.log('Migration deploy finished successfully.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}
