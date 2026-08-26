'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const repoRoot = path.join(__dirname, '..');
const guardPath = path.join(repoRoot, 'scripts/architecture-guard.mjs');

/** @type {string[]} */
const tempRoots = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tmp = tempRoots.pop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function runCi(root) {
  return spawnSync(process.execPath, [guardPath, '--ci'], {
    encoding: 'utf8',
    env: { ...process.env, ARCHITECTURE_GUARD_ROOT: root },
  });
}

function runHook(payload) {
  return spawnSync(process.execPath, [guardPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: repoRoot,
  });
}

function writeUiFile(tmp, relativePath, contents) {
  const full = path.join(tmp, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function makeTemp(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(tmp);
  return tmp;
}

describe('architecture-guard --ci', () => {
  it('exits 0 on a clean UI tree', () => {
    const tmp = makeTemp('arch-guard-ok-');
    writeUiFile(tmp, 'src/app/Clean.tsx', 'export const x = 1;\n');

    const result = runCi(tmp);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ok/);
  });

  it('exits 1 when a UI file calls fetch', () => {
    const tmp = makeTemp('arch-guard-fetch-');
    writeUiFile(
      tmp,
      'src/app/Bad.tsx',
      'export async function go() { await fetch("https://example.com"); }\n',
    );

    const result = runCi(tmp);
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/must not call fetch/);
  });

  it('exits 1 when a UI file calls getDatabase', () => {
    const tmp = makeTemp('arch-guard-db-');
    writeUiFile(
      tmp,
      'src/components/Bad.tsx',
      'export function go() { return getDatabase(); }\n',
    );

    const result = runCi(tmp);
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /must not call getDatabase/,
    );
  });

  it('exits 1 when a UI file calls executeSql', () => {
    const tmp = makeTemp('arch-guard-sql-');
    writeUiFile(
      tmp,
      'src/app/Bad.tsx',
      'export function go(db) { db.executeSql("SELECT 1"); }\n',
    );

    const result = runCi(tmp);
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /must not call executeSql/,
    );
  });

  it('does not fail on English UI copy or service-layer fetch', () => {
    const tmp = makeTemp('arch-guard-copy-');
    writeUiFile(
      tmp,
      'src/app/Ok.tsx',
      "export const label = 'Select a book from the library';\n",
    );
    writeUiFile(
      tmp,
      'src/services/http.ts',
      'export async function go() { await fetch("/x"); }\n',
    );

    const result = runCi(tmp);
    expect(result.status).toBe(0);
  });

  it('skips test files under UI trees', () => {
    const tmp = makeTemp('arch-guard-test-');
    writeUiFile(
      tmp,
      'src/app/Foo.test.tsx',
      'export async function go() { await fetch("/x"); }\n',
    );

    const result = runCi(tmp);
    expect(result.status).toBe(0);
  });

  it('exits 0 on the real repo UI tree', () => {
    const result = runCi(repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ok/);
  });
});

describe('architecture-guard hook mode', () => {
  it('exits 0 and warns (does not deny) on fetch in UI content', () => {
    const result = runHook({
      tool_input: {
        file_path: '/repo/src/app/screens/Bad.tsx',
        content: 'await fetch("https://example.com")',
      },
    });

    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout || '{}');
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.additionalContext).toMatch(/not blocking/);
    expect(out.hookSpecificOutput.additionalContext).toMatch(/fetch/);
  });

  it('exits 0 quietly for non-UI paths', () => {
    const result = runHook({
      tool_input: {
        file_path: '/repo/src/services/api.ts',
        content: 'await fetch("https://example.com")',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout || '').toBe('');
  });
});
