#!/usr/bin/env node
/**
 * Warn-only architecture guard for fluent-mobile.
 * Flags fetch( / raw SQL in src/app and src/components. Never denies.
 *
 * Accepts Claude PreToolUse JSON or Cursor Write/StrReplace hook JSON on stdin.
 */
import { readFileSync } from 'node:fs';

const allow = (agentMessage) => {
  if (agentMessage) {
    process.stdout.write(
      JSON.stringify({
        permission: 'allow',
        agent_message: agentMessage,
        hookSpecificOutput: { additionalContext: agentMessage },
      }),
    );
  }
  process.exit(0);
};

const FETCH_RE = /\bfetch\s*\(/;
const SQL_RE =
  /\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|executeSql)\b/i;

const isUiPath = (filePath) => {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    /\/src\/app\//.test(normalized) || /\/src\/components\//.test(normalized)
  );
};

const isCode = (filePath) => /\.(ts|tsx|js|jsx)$/.test(filePath);

try {
  const raw = await new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (c) => (buf += c));
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

  const warnings = [];
  if (FETCH_RE.test(text)) {
    warnings.push(
      `${filePath}: UI layer must not call fetch() — use FluentAPI in src/services/api.ts plus sync.`,
    );
  }
  if (SQL_RE.test(text)) {
    warnings.push(
      `${filePath}: UI layer must not write SQL — use src/db/repository.ts (writes) and src/db/queries.ts (reads).`,
    );
  }

  if (warnings.length === 0) allow();
  allow(`Architecture warning (not blocking):\n${warnings.join('\n')}`);
} catch {
  allow();
}
