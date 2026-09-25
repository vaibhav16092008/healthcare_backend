// db-identity.mjs — Database identity investigation script
// Safely identifies which PostgreSQL server TEST_DATABASE_URL connects to.
// NEVER prints the password, full connection string, or any secret.

import { createRequire } from 'module';

// Load .env before importing anything that reads env vars.
// createRequire is required to call require() from an ES module.
const require = createRequire(import.meta.url);
require('dotenv').config();

import { PrismaClient } from '@prisma/client';

// ── 1. Read and trim the connection string ───────────────────────────────────
const rawUrl = (process.env.TEST_DATABASE_URL ?? '').trim();

if (!rawUrl) {
  console.error(
    'ERROR: TEST_DATABASE_URL is not set or is empty in .env.\n' +
    'Set TEST_DATABASE_URL in .env and try again.'
  );
  process.exit(1);
}

// ── 2. Safe URL parser ───────────────────────────────────────────────────────
// Passwords may contain '@', '!', '#', '$', '%', '^', '&', '*' and other
// characters that are invalid in the standard URL class without percent-
// encoding. We parse manually using lastIndexOf('@') to find the true host.
//
// Format: postgresql://user:pass@host:port/dbname[?options]
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

// ── 3. Build a percent-encoded URL for Prisma ────────────────────────────────
// Prisma's URL parser requires special characters in the password to be
// percent-encoded. We encode only the password, never the host or db name.
// The encoded URL is constructed in memory and NEVER printed.
function buildEncodedUrl(p) {
  const encodedPass = encodeURIComponent(p.password);
  const qs = p.queryString ? `?${p.queryString}` : '';
  return `postgresql://${p.username}:${encodedPass}@${p.hostname}:${p.port}/${p.dbName}${qs}`;
}

const encodedUrl = buildEncodedUrl(parsed);

// ── 4. Report safe connection metadata ──────────────────────────────────────
console.log('=== DATABASE IDENTITY REPORT ===');
console.log('Host (from URL)    :', parsed.hostname);
console.log('Port (from URL)    :', parsed.port);
console.log('DB name (from URL) :', parsed.dbName);
console.log('User (from URL)    :', parsed.username);

// ── 5. Verdict from URL alone ────────────────────────────────────────────────
const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
const isSupabase  = parsed.hostname.includes('supabase.co') || parsed.hostname.includes('supabase.com');

// ── 6. Connect and query server identity ────────────────────────────────────
// Pass the ENCODED URL to PrismaClient so its URL parser can handle it.
const prisma = new PrismaClient({
  datasources: { db: { url: encodedUrl } },
  log: [],
});

async function main() {
  await prisma.$connect();

  const [row] = await prisma.$queryRaw`
    SELECT
      current_database()       AS db_name,
      current_user             AS db_user,
      inet_server_addr()::text AS server_addr,
      inet_server_port()       AS server_port,
      version()                AS pg_version
  `;

  console.log('--- Server-Reported Identity ---');
  console.log('current_database()  :', row.db_name);
  console.log('current_user        :', row.db_user);
  console.log('inet_server_addr()  :', row.server_addr);
  console.log('inet_server_port()  :', row.server_port);
  console.log('PG version          :', row.pg_version);

  const tables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  console.log('--- Table Inventory ---');
  console.log('Table count         :', tables.length);
  if (tables.length > 0) {
    console.log('Tables              :', tables.map((t) => t.table_name).join(', '));
  } else {
    console.log('No application tables found in public schema.');
  }

  console.log('--- VERDICT ---');
  if (isLocalhost) {
    console.log('VERDICT: TEST_DATABASE_URL -> LOCAL PostgreSQL (NOT Supabase cloud)');
  } else if (isSupabase) {
    console.log('VERDICT: TEST_DATABASE_URL -> Supabase cloud PostgreSQL confirmed');
    console.log('Project host        :', parsed.hostname);
  } else {
    console.log('VERDICT: TEST_DATABASE_URL -> UNKNOWN host:', parsed.hostname);
  }
}

main()
  .catch((err) => {
    console.error('CONNECTION FAILED :', err.code ?? '', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
