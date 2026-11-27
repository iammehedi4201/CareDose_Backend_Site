import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

function loadDotEnvIfNeeded() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function findPgBinaries(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [];

  if (process.platform === 'win32') {
    const pgBase = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(pgBase)) {
      const versions = readdirSync(pgBase).sort((a, b) => Number(b) - Number(a));
      for (const ver of versions) {
        const candidate = join(pgBase, ver, 'bin', exe);
        if (existsSync(candidate)) {
          candidates.push(candidate);
        }
      }
    }
  }

  try {
    const probeCmd = process.platform === 'win32' ? 'where' : 'which';
    const found = execFileSync(probeCmd, [exe], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const f of found) {
      if (existsSync(f) && !candidates.includes(f)) {
        candidates.push(f);
      }
    }
  } catch {
    // Ignore if absent from PATH
  }

  if (candidates.length === 0) {
    throw new Error(`Could not locate PostgreSQL binary "${exe}" in PATH or standard folders.`);
  }
  return candidates;
}

const LIBPQ_ALLOWED_PARAMS = new Set([
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslcrl',
  'connect_timeout',
  'application_name',
  'target_session_attrs',
  'options',
]);

function cleanLibpqUrl(rawUrl) {
  const u = new URL(rawUrl);
  for (const key of Array.from(u.searchParams.keys())) {
    if (!LIBPQ_ALLOWED_PARAMS.has(key.toLowerCase())) {
      u.searchParams.delete(key);
    }
  }
  return u;
}

function redactUriCredentials(text) {
  return String(text).replace(
    /(postgres(?:ql)?:\/\/[^:\s/]+:)([^@\s/]+)(@)/gi,
    '$1***$3',
  );
}

function runPgTool(binPath, args) {
  try {
    return execFileSync(binPath, args, {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? err.stderr : '';
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      redactUriCredentials(
        `${binPath} failed: ${String(stderr || msg).trim()}`,
      ),
    );
  }
}

function runWithCompatiblePgBinary(candidates, buildArgs) {
  let lastError = null;
  for (const binPath of candidates) {
    try {
      return { binPath, output: runPgTool(binPath, buildArgs()) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function main() {
  loadDotEnvIfNeeded();

  const rawTestUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!rawTestUrl) {
    throw new Error('TEST_DATABASE_URL must be set to verify PostgreSQL backup/restore safely.');
  }

  if (!/test/i.test(rawTestUrl) && process.env.ALLOW_NON_TEST_DB_NAME !== 'true') {
    throw new Error(
      'Refusing backup verification because TEST_DATABASE_URL does not clearly reference a test database.',
    );
  }

  const parsedSource = cleanLibpqUrl(rawTestUrl);
  const sourceConnUri = parsedSource.toString();
  const sourceDbName = parsedSource.pathname.replace(/^\//, '');

  const pgDumpCandidates = findPgBinaries('pg_dump');
  const pgRestoreCandidates = findPgBinaries('pg_restore');
  const psqlCandidates = findPgBinaries('psql');

  const verifyDbName = `caredose_restore_verify_test_${Date.now()}`;
  const adminUrl = new URL(sourceConnUri);
  adminUrl.pathname = '/postgres';
  const verifyUrl = new URL(sourceConnUri);
  verifyUrl.pathname = `/${verifyDbName}`;

  const workDir = join(tmpdir(), 'caredose-backup-verify');
  mkdirSync(workDir, { recursive: true });
  const dumpFile = join(workDir, `${sourceDbName}-${Date.now()}.dump`);

  const requiredTables = [
    '_prisma_migrations',
    'User',
    'PatientProfile',
    'PatientMedication',
    'MedicationSchedule',
    'DoseEvent',
    'InventoryTransaction',
    'Purchase',
    'HealthReading',
    'MedicineBrand',
  ];

  let tempDbCreated = false;
  let activePsql = psqlCandidates[0];

  try {
    const serverVerRes = runWithCompatiblePgBinary(psqlCandidates, () => [
      sourceConnUri,
      '-t',
      '-A',
      '-c',
      'SHOW server_version;',
    ]);
    const serverMajor = serverVerRes.output.trim().split('.')[0];
    const reorderByServerMajor = (list) => [
      ...list.filter((p) => p.includes(`PostgreSQL\\${serverMajor}\\`) || p.includes(`/${serverMajor}/`)),
      ...list.filter((p) => !p.includes(`PostgreSQL\\${serverMajor}\\`) && !p.includes(`/${serverMajor}/`)),
    ];
    const preferredPsql = reorderByServerMajor(psqlCandidates);
    const preferredPgDump = reorderByServerMajor(pgDumpCandidates);
    const preferredPgRestore = reorderByServerMajor(pgRestoreCandidates);
    activePsql = preferredPsql[0];

    console.error(`[backup:verify] Connected to PG ${serverVerRes.output.trim()}; reading migrations...`);
    const sourceMigrations = Number(
      runPgTool(activePsql, [
        sourceConnUri,
        '-t',
        '-A',
        '-c',
        'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;',
      ]).trim(),
    );

    console.error('[backup:verify] Running pg_dump (-n public -Fc)...');
    const pgDumpRes = runWithCompatiblePgBinary(preferredPgDump, () => [
      '--dbname',
      sourceConnUri,
      '-n',
      'public',
      '-Fc',
      '-f',
      dumpFile,
    ]);

    const matchingPgRestore =
      preferredPgRestore.find((p) => dirname(p) === dirname(pgDumpRes.binPath)) ??
      preferredPgRestore[0];

    console.error('[backup:verify] Verifying archive TOC entries...');
    const tocOutput = runPgTool(matchingPgRestore, ['--list', dumpFile]);
    const missingFromToc = requiredTables.filter((t) => !tocOutput.includes(t));
    if (missingFromToc.length > 0) {
      throw new Error(
        `pg_dump archive missing required CareDose tables: ${missingFromToc.join(', ')}`,
      );
    }

    let restoreMode = 'archive_toc_verified';
    let restoredMigrations = null;
    let restoredTables = null;

    // Attempt full clean database restore when connected to a PostgreSQL role permitting CREATE DATABASE
    try {
      console.error(`[backup:verify] Creating isolated temporary database ${verifyDbName}...`);
      runPgTool(activePsql, [
        adminUrl.toString(),
        '-c',
        `CREATE DATABASE "${verifyDbName}";`,
      ]);
      tempDbCreated = true;

      const currentDb = runPgTool(activePsql, [
        verifyUrl.toString(),
        '-t',
        '-A',
        '-c',
        'SELECT current_database();',
      ]).trim();
      if (currentDb !== verifyDbName) {
        throw new Error(
          `Safety abort: expected temp connection to "${verifyDbName}" but reached "${currentDb}".`,
        );
      }

      // Drop default template1 public schema on the empty temp DB so pg_dump's CREATE SCHEMA public succeeds cleanly
      runPgTool(activePsql, [
        verifyUrl.toString(),
        '-c',
        'DROP SCHEMA IF EXISTS public CASCADE;',
      ]);

      console.error(`[backup:verify] Running pg_restore into ${verifyDbName}...`);
      runPgTool(matchingPgRestore, [
        '--dbname',
        verifyUrl.toString(),
        '--no-owner',
        '--no-privileges',
        dumpFile,
      ]);

      restoredMigrations = Number(
        runPgTool(activePsql, [
          verifyUrl.toString(),
          '-t',
          '-A',
          '-c',
          'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;',
        ]).trim(),
      );

      restoredTables = Number(
        runPgTool(activePsql, [
          verifyUrl.toString(),
          '-t',
          '-A',
          '-c',
          "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';",
        ]).trim(),
      );

      if (sourceMigrations !== restoredMigrations || restoredTables < 14) {
        throw new Error(
          `Restore verification mismatch: sourceMigrations=${sourceMigrations}, restoredMigrations=${restoredMigrations}, restoredTables=${restoredTables}`,
        );
      }
      restoreMode = 'temporary_database_restored';
    } catch (dbCreateErr) {
      if (tempDbCreated) {
        throw dbCreateErr;
      }
      // Managed cloud hosts without CREATE DATABASE privileges still verify archive readability & TOC tables
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          verifiedAt: new Date().toISOString(),
          targetHost: parsedSource.hostname,
          sourceDatabase: sourceDbName,
          restoreMode,
          appliedMigrationsOnSource: sourceMigrations,
          restoredMigrationsVerified: restoredMigrations,
          restoredPublicTablesCount: restoredTables,
          verifiedTablesInDumpArchive: requiredTables.length,
        },
        null,
        2,
      ),
    );
  } finally {
    if (tempDbCreated) {
      try {
        try {
          runPgTool(activePsql, [
            adminUrl.toString(),
            '-c',
            `DROP DATABASE IF EXISTS "${verifyDbName}" WITH (FORCE);`,
          ]);
        } catch {
          runPgTool(activePsql, [
            adminUrl.toString(),
            '-c',
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${verifyDbName}' AND pid <> pg_backend_pid();`,
          ]);
          runPgTool(activePsql, [
            adminUrl.toString(),
            '-c',
            `DROP DATABASE IF EXISTS "${verifyDbName}";`,
          ]);
        }
      } catch {
        // Best-effort cleanup of temp database
      }
    }

    if (existsSync(dumpFile)) {
      rmSync(dumpFile, { force: true });
    }
  }
}

main();
