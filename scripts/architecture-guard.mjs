#!/usr/bin/env node
/**
 * Architecture guard for fluent-mobile UI layers (`src/app`, `src/components`).
 *
 * Modes:
 * - Default (stdin hook): warn-only for Cursor/Claude PreToolUse — never denies.
 * - `--ci`: scan UI trees on disk; exit 1 on violations (merge gate).
 *
 * Patterns aligned with ESLint layer bans (#366) where possible: bare `fetch(`,
 * `getDatabase(`, `executeSql` — not English UI copy like "Select take".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FETCH_RE = /\bfetch\s*\(/;
export const GET_DATABASE_RE = /\bgetDatabase\s*\(/;
export const EXECUTE_SQL_RE = /\bexecuteSql\s*\(/;

export function isUiPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    /(?:^|\/)src\/app\//.test(normalized) ||
    /(?:^|\/)src\/components\//.test(normalized)
  );
}

export function isCode(filePath) {
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

/** Skip intentional ESLint fixtures and tests under UI trees. */
export function isSkippableUiPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    /\/__fixtures__\//.test(normalized) ||
    /\.test\.(ts|tsx|js|jsx)$/.test(normalized)
  );
}

/**
 * @param {string} filePath
 * @param {string} text
 * @returns {string[]}
 */
export function findViolations(filePath, text) {
  if (!isUiPath(filePath) || !isCode(filePath) || isSkippableUiPath(filePath)) {
    return [];
  }

  const warnings = [];
  if (FETCH_RE.test(text)) {
    warnings.push(
      `${filePath}: UI layer must not call fetch() — use FluentAPI in src/services/api.ts plus sync.`,
    );
  }
  if (GET_DATABASE_RE.test(text)) {
    warnings.push(
      `${filePath}: UI layer must not call getDatabase() — use src/db/queries.ts / src/db/repository.ts.`,
    );
  }
  if (EXECUTE_SQL_RE.test(text)) {
    warnings.push(
      `${filePath}: UI layer must not call executeSql — use src/db/queries.ts / src/db/repository.ts.`,
    );
  }
  return warnings;
}

/**
 * @param {string} rootDir
 * @param {string[]} relativeDirs
 * @returns {string[]}
 */
export function collectCodeFiles(rootDir, relativeDirs) {
  const files = [];

  const walk = dir => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === '__fixtures__') continue;
        walk(full);
      } else if (isCode(full) && !isSkippableUiPath(full)) {
        files.push(full);
      }
    }
  };

  for (const rel of relativeDirs) {
    walk(path.join(rootDir, rel));
  }
  return files;
}

/**
 * @param {string} rootDir
 * @returns {string[]}
 */
export function scanUiTree(rootDir) {
  const files = collectCodeFiles(rootDir, ['src/app', 'src/components']);
  const all = [];
  for (const filePath of files) {
    let text;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    all.push(...findViolations(filePath, text));
  }
  return all;
}

const allow = agentMessage => {
  if (agentMessage) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          additionalContext: agentMessage,
        },
      }),
    );
  }
  process.exit(0);
};

async function runHookMode() {
  try {
    const raw = await new Promise(resolve => {
      let buf = '';
      process.stdin.on('data', c => (buf += c));
      process.stdin.on('end', () => resolve(buf));
      setTimeout(() => resolve(buf), 2000);
    });

    const payload = JSON.parse(raw || '{}');
    const input = payload.tool_input || payload.input || {};
    const filePath = input.file_path || input.path || '';
    if (!filePath || !isUiPath(filePath) || !isCode(filePath)) allow();

    let text = input.content ?? input.contents ?? input.new_string ?? '';
    if (!text && filePath) {
      try {
        text = readFileSync(filePath, 'utf8');
      } catch {
        allow();
      }
    }

    const warnings = findViolations(filePath, text);
    if (warnings.length === 0) allow();
    allow(`Architecture warning (not blocking):\n${warnings.join('\n')}`);
  } catch {
    allow();
  }
}

function runCiMode() {
  const root =
    process.env.ARCHITECTURE_GUARD_ROOT ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const violations = scanUiTree(root);
  if (violations.length === 0) {
    process.stdout.write('architecture-guard: ok\n');
    process.exit(0);
  }
  process.stderr.write(
    `architecture-guard: ${violations.length} violation(s)\n${violations.join('\n')}\n`,
  );
  process.exit(1);
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  if (process.argv.includes('--ci')) {
    runCiMode();
  } else {
    await runHookMode();
  }
}
