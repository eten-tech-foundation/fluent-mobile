#!/usr/bin/env node
/**
 * Read-only check that a verse-audio take exists for the fixture user.
 * GET only. Refuses denylisted or non-allowlisted projects before any request.
 *
 * Usage:
 *   node scripts/maestro-verify-receipt.mjs \
 *     --project-id ID --project-unit-id ID --bible-text-id ID [--take-id ID]
 *
 * GET /verse-audio/{projectUnitId}/{bibleTextId} (docs/guides/recordings-sync-contract.md).
 *
 * Env: EXPO_PUBLIC_API_BASE_URL, MAESTRO_EMAIL, MAESTRO_PASSWORD,
 *      MAESTRO_FIXTURE_PROJECT_ALLOWLIST, MAESTRO_FIXTURE_PROJECT_DENYLIST
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertProjectAllowed } = require('./maestro-fixture-guard.cjs');

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return '';
  return process.argv[index + 1];
}

function blocked(reason) {
  console.error(`BLOCKED: ${reason}`);
  process.exit(2);
}

async function main() {
  const projectId = arg('--project-id') || process.env.MAESTRO_FIXTURE_PROJECT_ID || '';
  const projectUnitId = arg('--project-unit-id');
  const bibleTextId = arg('--bible-text-id');
  const takeId = arg('--take-id');
  const gate = assertProjectAllowed(
    projectId,
    process.env.MAESTRO_FIXTURE_PROJECT_ALLOWLIST,
    process.env.MAESTRO_FIXTURE_PROJECT_DENYLIST,
  );
  if (!gate.ok) blocked(gate.reason);
  if (!projectUnitId || !bibleTextId) {
    blocked('pass --project-unit-id and --bible-text-id');
  }

  const base = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
  const email = process.env.MAESTRO_EMAIL || '';
  const password = process.env.MAESTRO_PASSWORD || '';
  if (!base || !email || !password) {
    blocked('API base URL and MAESTRO_EMAIL / MAESTRO_PASSWORD are required');
  }

  const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: base,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!signIn.ok) {
    console.error(`FAIL: sign-in HTTP ${signIn.status}`);
    process.exit(1);
  }
  const token = signIn.headers.get('set-auth-token') || '';
  if (!token) blocked('sign-in returned no auth token header');

  const path = `/verse-audio/${encodeURIComponent(projectUnitId)}/${encodeURIComponent(bibleTextId)}`;
  const receipt = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      origin: base,
    },
  });
  if (receipt.status === 404) {
    console.error(`FAIL: no verse audio at ${path}`);
    process.exit(1);
  }
  if (!receipt.ok) {
    console.error(`FAIL: receipt HTTP ${receipt.status}`);
    process.exit(1);
  }
  const body = await receipt.json();
  if (takeId && String(body.id) !== String(takeId)) {
    console.error(`FAIL: server id ${body.id} !== expected take ${takeId}`);
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      projectId,
      projectUnitId,
      bibleTextId,
      id: body.id ?? null,
      uploadedBy: body.uploadedBy ?? null,
      downloadUrlPresent: Boolean(body.downloadUrl),
    }),
  );
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('maestro-verify-receipt.mjs');
if (isDirectRun) {
  main().catch(error => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
