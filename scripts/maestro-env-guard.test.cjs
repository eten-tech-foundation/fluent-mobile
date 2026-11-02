const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MAESTRO_QA_API_BASE_URL,
  assertQaApiBaseUrl,
  assertQaCliEnvOverrides,
  assertQaEnvSelection,
  evaluateQaEnvGuard,
  normalizeApiBaseUrl,
} = require('./maestro-env-guard.cjs');

const root = path.join(__dirname, '..');
const REAL_MAESTRO_BIN = path.join(os.homedir(), '.maestro', 'bin');

function writeEnvFile(dir, basename, body) {
  const file = path.join(dir, basename);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

function makeStubHome(dir) {
  // maestro-test.sh prepends $HOME/.maestro/bin — stub there so the real CLI
  // never runs (and never touches a device). INCIDENT 2026-10-19: a probe with
  // real HOME/PATH ran live launch.yaml; stubs must stay under fake HOME only.
  const home = path.join(dir, 'home');
  const maestroBin = path.join(home, '.maestro', 'bin');
  fs.mkdirSync(maestroBin, { recursive: true });
  const marker = path.join(dir, 'maestro-ran');
  const adbLog = path.join(dir, 'adb-calls.log');
  const stubAdb = `#!/bin/sh
printf '%s\\n' "$*" >> "${adbLog}"
case "$1" in
  start-server) exit 0 ;;
  devices) printf 'List of devices attached\\nemulator-5554\\tdevice\\n'; exit 0 ;;
  -s) exit 0 ;;
  *) exit 0 ;;
esac
`;
  const stubMaestro = `#!/bin/sh
printf 'MAESTRO_RAN\\n' > "${marker}"
exit 0
`;
  fs.writeFileSync(path.join(maestroBin, 'adb'), stubAdb, { mode: 0o755 });
  fs.writeFileSync(path.join(maestroBin, 'maestro'), stubMaestro, {
    mode: 0o755,
  });
  const nodeDir = path.dirname(process.execPath);
  // Exclude the real ~/.maestro/bin directory entirely.
  const pathEnv = `${maestroBin}:${nodeDir}:/usr/bin:/bin`;
  return { home, maestroBin, marker, adbLog, pathEnv };
}

/** Same PATH+HOME maestro-test.sh will see after prepending $HOME/.maestro/bin. */
function assertToolsIsolated(home, pathEnv) {
  const maestroBin = path.join(home, '.maestro', 'bin');
  const simulatedPath = `${maestroBin}:${pathEnv}`;
  const check = spawnSync(
    'bash',
    ['-c', 'command -v maestro; command -v adb'],
    {
      env: {
        PATH: simulatedPath,
        HOME: home,
      },
      encoding: 'utf8',
    },
  );
  if (check.status !== 0) {
    throw new Error(
      `ABORT isolation: command -v failed: ${check.stderr || check.stdout}`,
    );
  }
  const [maestroPath, adbPath] = check.stdout.trim().split(/\n/);
  if (!maestroPath || !adbPath) {
    throw new Error(`ABORT isolation: missing tool path (${check.stdout})`);
  }
  const resolvedMaestro = fs.realpathSync(maestroPath);
  const resolvedAdb = fs.realpathSync(adbPath);
  const binRoot = fs.realpathSync(maestroBin);
  if (!resolvedMaestro.startsWith(`${binRoot}${path.sep}`)) {
    throw new Error(
      `ABORT isolation: maestro resolves outside fake home: ${resolvedMaestro}`,
    );
  }
  if (!resolvedAdb.startsWith(`${binRoot}${path.sep}`)) {
    throw new Error(
      `ABORT isolation: adb resolves outside fake home: ${resolvedAdb}`,
    );
  }
  if (resolvedMaestro.startsWith(REAL_MAESTRO_BIN)) {
    throw new Error(
      `ABORT isolation: maestro is real CLI: ${resolvedMaestro}`,
    );
  }
  return { maestroPath: resolvedMaestro, adbPath: resolvedAdb };
}

function adbCallCount(adbLog) {
  if (!fs.existsSync(adbLog)) return 0;
  return fs
    .readFileSync(adbLog, 'utf8')
    .split(/\n/)
    .filter(Boolean).length;
}

describe('maestro env guard (pure)', () => {
  it('normalizes trailing slashes', () => {
    expect(normalizeApiBaseUrl('https://qa.api.fluent.bible/')).toBe(
      MAESTRO_QA_API_BASE_URL,
    );
  });

  it('allows only the immutable QA base URL', () => {
    expect(assertQaApiBaseUrl(MAESTRO_QA_API_BASE_URL).ok).toBe(true);
    expect(assertQaApiBaseUrl('').ok).toBe(false);
    expect(assertQaApiBaseUrl('not-a-url').ok).toBe(false);
    expect(assertQaApiBaseUrl('https://dev.api.fluent.bible').ok).toBe(false);
    expect(assertQaApiBaseUrl('http://qa.api.fluent.bible').ok).toBe(false);
    expect(assertQaApiBaseUrl('https://qa.api.fluent.bible/extra').ok).toBe(
      false,
    );
  });

  it('requires lane=qa and .env.maestro.qa basename', () => {
    expect(
      assertQaEnvSelection({
        lane: 'qa',
        envFilePath: '/tmp/.env.maestro.qa',
      }).ok,
    ).toBe(true);
    expect(
      assertQaEnvSelection({
        lane: '',
        envFilePath: '/tmp/.env.maestro.qa',
      }).ok,
    ).toBe(false);
    expect(
      assertQaEnvSelection({
        lane: 'qa',
        envFilePath: '/tmp/.env.maestro',
      }).reason,
    ).toMatch(/refuses env file/);
  });

  it('evaluates file contents without trusting process env', () => {
    const good = writeEnvFile(
      fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-qa-good-')),
      '.env.maestro.qa',
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\n`,
    );
    const bad = writeEnvFile(
      fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-qa-bad-')),
      '.env.maestro.qa',
      'EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible\n',
    );
    const missing = writeEnvFile(
      fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-qa-miss-')),
      '.env.maestro.qa',
      'MAESTRO_EMAIL=x\n',
    );

    expect(evaluateQaEnvGuard({ lane: 'qa', envFilePath: good }).ok).toBe(true);
    expect(evaluateQaEnvGuard({ lane: 'qa', envFilePath: bad }).ok).toBe(false);
    expect(
      evaluateQaEnvGuard({ lane: 'qa', envFilePath: missing }).reason,
    ).toMatch(/missing/);

    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://dev.api.fluent.bible';
    expect(evaluateQaEnvGuard({ lane: 'qa', envFilePath: good }).ok).toBe(true);
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  });

  it('refuses Maestro -e / --env / equal-form API base overrides', () => {
    const blocked = /immutable pin/;
    expect(
      assertQaCliEnvOverrides([
        '-e',
        'EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible',
      ]).ok,
    ).toBe(false);
    expect(
      assertQaCliEnvOverrides([
        '--env',
        'EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible',
      ]).reason,
    ).toMatch(blocked);
    expect(
      assertQaCliEnvOverrides([
        '--env=EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible',
      ]).ok,
    ).toBe(false);
    expect(
      assertQaCliEnvOverrides([
        '-eEXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible',
      ]).ok,
    ).toBe(false);
    expect(
      assertQaCliEnvOverrides([
        '-e',
        'EXPO_PUBLIC_API_BASE_URL',
        'https://dev.api.fluent.bible',
      ]).ok,
    ).toBe(false);
    // Even pinning the QA URL via CLI is refused — runner pin is sole source.
    expect(
      assertQaCliEnvOverrides([
        '-e',
        `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}`,
      ]).ok,
    ).toBe(false);
    expect(
      assertQaCliEnvOverrides(['-e', 'EXPO_PUBLIC_E2E_MODE=1']).ok,
    ).toBe(true);
    expect(assertQaCliEnvOverrides([]).ok).toBe(true);
  });
});

describe('maestro QA runner gate (stubbed adb/maestro)', () => {
  const harness = path.join(root, '.maestro/flows/harness/launch.yaml');

  function spawnQaRunner(args, { home, pathEnv, envPath, extraEnv = {} }) {
    assertToolsIsolated(home, pathEnv);
    return spawnSync(
      'bash',
      [
        path.join(root, 'scripts/maestro-test-qa.sh'),
        ...args,
        '--test-output-dir',
        path.join(path.dirname(envPath), 'out'),
      ],
      {
        cwd: root,
        env: {
          PATH: pathEnv,
          MAESTRO_ENV_FILE: envPath,
          MAESTRO_KEEP_EXPORTS: extraEnv.MAESTRO_KEEP_EXPORTS || '',
          EXPO_PUBLIC_API_BASE_URL: extraEnv.EXPO_PUBLIC_API_BASE_URL || '',
          HOME: home,
          ANDROID_SERIAL: 'emulator-5554',
          // Non-login bash: do not inherit interactive profile secrets.
          BASH_ENV: '',
          ENV: '',
        },
        encoding: 'utf8',
      },
    );
  }

  function runQaTest(envFile, extraEnv = {}, extraArgs = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-qa-run-'));
    const stubs = makeStubHome(dir);
    const envPath = writeEnvFile(dir, '.env.maestro.qa', envFile);
    const result = spawnQaRunner(
      ['--config', '.maestro/config.yaml', harness, ...extraArgs],
      { ...stubs, envPath, extraEnv },
    );
    return { result, ...stubs, dir };
  }

  it('1 allows QA env and reaches stubbed Maestro only', () => {
    const { result, marker, adbLog } = runQaTest(
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\nMAESTRO_EMAIL=qa+test@example.com\n`,
    );
    expect(result.status).toBe(0);
    expect(fs.existsSync(marker)).toBe(true);
    expect(adbCallCount(adbLog)).toBeGreaterThan(0);
    expect(result.stderr || '').not.toMatch(/password|token/i);
  });

  it('2 denies Dev API base with zero adb and zero Maestro', () => {
    const { result, marker, adbLog } = runQaTest(
      'EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible\n',
    );
    expect(result.status).toBe(2);
    expect(fs.existsSync(marker)).toBe(false);
    expect(adbCallCount(adbLog)).toBe(0);
    expect(result.stderr).toMatch(/Dev API host|must be https:\/\/qa\.api/);
  });

  it('3 denies missing API base with zero adb and zero Maestro', () => {
    const { result, marker, adbLog } = runQaTest(
      'MAESTRO_EMAIL=qa+test@example.com\n',
    );
    expect(result.status).toBe(2);
    expect(fs.existsSync(marker)).toBe(false);
    expect(adbCallCount(adbLog)).toBe(0);
    expect(result.stderr).toMatch(/missing/);
  });

  it('4 denies default .env.maestro under QA lane with zero adb/Maestro', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-qa-deny-'));
    const stubs = makeStubHome(dir);
    assertToolsIsolated(stubs.home, stubs.pathEnv);
    const devFile = writeEnvFile(
      dir,
      '.env.maestro',
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\n`,
    );
    const result = spawnSync(
      'bash',
      [
        path.join(root, 'scripts/maestro-test.sh'),
        '--config',
        '.maestro/config.yaml',
        harness,
        '--test-output-dir',
        path.join(dir, 'out'),
      ],
      {
        cwd: root,
        env: {
          PATH: stubs.pathEnv,
          MAESTRO_ENV_LANE: 'qa',
          MAESTRO_ENV_FILE: devFile,
          HOME: stubs.home,
          ANDROID_SERIAL: 'emulator-5554',
          BASH_ENV: '',
          ENV: '',
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(2);
    expect(fs.existsSync(stubs.marker)).toBe(false);
    expect(adbCallCount(stubs.adbLog)).toBe(0);
    expect(result.stderr).toMatch(/refuses env file/);
  });

  it('5 pins QA base over a stale KEEP_EXPORTS Dev shell export', () => {
    const { result, marker, adbLog } = runQaTest(
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\n`,
      {
        MAESTRO_KEEP_EXPORTS: '1',
        EXPO_PUBLIC_API_BASE_URL: 'https://dev.api.fluent.bible',
      },
    );
    expect(result.status).toBe(0);
    expect(fs.existsSync(marker)).toBe(true);
    expect(adbCallCount(adbLog)).toBeGreaterThan(0);
  });

  it('6 denies Maestro -e Dev API override with zero adb/Maestro', () => {
    const { result, marker, adbLog } = runQaTest(
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\n`,
      {},
      ['-e', 'EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible'],
    );
    expect(result.status).toBe(2);
    expect(fs.existsSync(marker)).toBe(false);
    expect(adbCallCount(adbLog)).toBe(0);
    expect(result.stderr).toMatch(/-e\/--env EXPO_PUBLIC_API_BASE_URL/);
  });

  it('7 denies Maestro --env= Dev API override with zero adb/Maestro', () => {
    const { result, marker, adbLog } = runQaTest(
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\n`,
      {},
      ['--env=EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible'],
    );
    expect(result.status).toBe(2);
    expect(fs.existsSync(marker)).toBe(false);
    expect(adbCallCount(adbLog)).toBe(0);
  });

  it('8 denies Maestro -e KEY VALUE Dev override with zero adb/Maestro', () => {
    const { result, marker, adbLog } = runQaTest(
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\n`,
      {},
      ['-e', 'EXPO_PUBLIC_API_BASE_URL', 'https://dev.api.fluent.bible'],
    );
    expect(result.status).toBe(2);
    expect(fs.existsSync(marker)).toBe(false);
    expect(adbCallCount(adbLog)).toBe(0);
  });

  it('9 denies glued -eKEY=VALUE Dev override with zero adb/Maestro', () => {
    const { result, marker, adbLog } = runQaTest(
      `EXPO_PUBLIC_API_BASE_URL=${MAESTRO_QA_API_BASE_URL}\n`,
      {},
      ['-eEXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible'],
    );
    expect(result.status).toBe(2);
    expect(fs.existsSync(marker)).toBe(false);
    expect(adbCallCount(adbLog)).toBe(0);
  });
});
