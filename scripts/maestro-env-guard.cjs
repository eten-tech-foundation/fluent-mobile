/**
 * Immutable Maestro lane / API-base checks. No network, no secrets in output.
 * QA runners must select lane=qa and .env.maestro.qa; Dev stays on .env.maestro.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAESTRO_QA_API_BASE_URL = 'https://qa.api.fluent.bible';
const MAESTRO_QA_ENV_BASENAME = '.env.maestro.qa';
const MAESTRO_DEV_API_HOST = 'dev.api.fluent.bible';

function normalizeApiBaseUrl(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\/+$/, '');
}

function readApiBaseUrlFromEnvFile(envFilePath) {
  const text = fs.readFileSync(envFilePath, 'utf8');
  let found;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key !== 'EXPO_PUBLIC_API_BASE_URL') continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    found = value;
  }
  return found;
}

function assertQaEnvSelection({ lane, envFilePath }) {
  const laneNorm = String(lane ?? '')
    .trim()
    .toLowerCase();
  if (laneNorm !== 'qa') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        'QA runner requires MAESTRO_ENV_LANE=qa (use scripts/maestro-test-qa.sh)',
    };
  }
  if (!envFilePath) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'QA runner requires MAESTRO_ENV_FILE=.env.maestro.qa',
    };
  }
  const base = path.basename(String(envFilePath));
  if (base !== MAESTRO_QA_ENV_BASENAME) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `QA runner refuses env file ${base}; use ${MAESTRO_QA_ENV_BASENAME} (not .env.maestro)`,
    };
  }
  return { ok: true, status: 'PASS', reason: '' };
}

function assertQaApiBaseUrl(rawUrl) {
  const url = normalizeApiBaseUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'EXPO_PUBLIC_API_BASE_URL is missing for QA',
    };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'EXPO_PUBLIC_API_BASE_URL is malformed for QA',
    };
  }
  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'QA EXPO_PUBLIC_API_BASE_URL must use https',
    };
  }
  if (parsed.hostname === MAESTRO_DEV_API_HOST) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `QA runner refuses Dev API host ${MAESTRO_DEV_API_HOST}`,
    };
  }
  if (url !== MAESTRO_QA_API_BASE_URL) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `QA EXPO_PUBLIC_API_BASE_URL must be ${MAESTRO_QA_API_BASE_URL}`,
    };
  }
  return { ok: true, status: 'PASS', reason: '', url: MAESTRO_QA_API_BASE_URL };
}

/**
 * Fail-closed QA check: explicit lane + QA env basename + file base URL pin.
 * Does not prove the Metro/app JS bundle host — only the Maestro runner env.
 */
function evaluateQaEnvGuard({ lane, envFilePath }) {
  const selection = assertQaEnvSelection({ lane, envFilePath });
  if (!selection.ok) return selection;

  const resolved = path.resolve(String(envFilePath));
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `QA env file missing: ${MAESTRO_QA_ENV_BASENAME} (copy .env.maestro.qa.example)`,
    };
  }

  let fromFile;
  try {
    fromFile = readApiBaseUrlFromEnvFile(resolved);
  } catch {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `QA env file unreadable: ${MAESTRO_QA_ENV_BASENAME}`,
    };
  }

  return assertQaApiBaseUrl(fromFile);
}

/**
 * Maestro `-e` / `--env` can override runner-exported vars. Under QA, refuse any
 * CLI assignment of EXPO_PUBLIC_API_BASE_URL (pin is the only allowed source).
 */
function assertQaCliEnvOverrides(maestroArgv) {
  const args = Array.isArray(maestroArgv) ? maestroArgv : [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let assignment = null;
    if (arg === '-e' || arg === '--env') {
      const next = args[i + 1];
      if (next === undefined) continue;
      if (next.includes('=')) {
        assignment = next;
        i += 1;
      } else if (args[i + 2] !== undefined && !String(args[i + 2]).startsWith('-')) {
        assignment = `${next}=${args[i + 2]}`;
        i += 2;
      } else {
        assignment = next;
        i += 1;
      }
    } else if (arg.startsWith('-e') && arg.length > 2 && arg.includes('=')) {
      // rare glued form -eKEY=VALUE
      assignment = arg.slice(2);
    } else if (arg.startsWith('--env=')) {
      assignment = arg.slice('--env='.length);
    }
    if (!assignment) continue;
    const eq = assignment.indexOf('=');
    const key = (eq >= 0 ? assignment.slice(0, eq) : assignment).trim();
    if (key !== 'EXPO_PUBLIC_API_BASE_URL') continue;
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        'QA runner refuses Maestro -e/--env EXPO_PUBLIC_API_BASE_URL (immutable pin)',
    };
  }
  return { ok: true, status: 'PASS', reason: '' };
}

function parseArgv(argv) {
  const out = {
    assertQa: false,
    lane: '',
    envFile: '',
    maestroArgs: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--assert-qa') {
      out.assertQa = true;
      continue;
    }
    if (arg === '--lane') {
      out.lane = argv[++i] ?? '';
      continue;
    }
    if (arg === '--env-file') {
      out.envFile = argv[++i] ?? '';
      continue;
    }
    if (arg === '--') {
      out.maestroArgs = argv.slice(i + 1);
      break;
    }
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgv(argv);
  if (!args.assertQa) {
    console.error(
      'usage: maestro-env-guard.cjs --assert-qa --lane qa --env-file .env.maestro.qa [-- maestro-args...]',
    );
    process.exit(2);
  }
  const result = evaluateQaEnvGuard({
    lane: args.lane || process.env.MAESTRO_ENV_LANE,
    envFilePath: args.envFile || process.env.MAESTRO_ENV_FILE,
  });
  if (!result.ok) {
    console.error(`error: ${result.reason}`);
    process.exit(2);
  }
  const cli = assertQaCliEnvOverrides(args.maestroArgs);
  if (!cli.ok) {
    console.error(`error: ${cli.reason}`);
    process.exit(2);
  }
  // Non-secret pin for the shell to export after a successful check.
  process.stdout.write(`${MAESTRO_QA_API_BASE_URL}\n`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  MAESTRO_QA_API_BASE_URL,
  MAESTRO_QA_ENV_BASENAME,
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnvFile,
  assertQaEnvSelection,
  assertQaApiBaseUrl,
  assertQaCliEnvOverrides,
  evaluateQaEnvGuard,
  main,
};
