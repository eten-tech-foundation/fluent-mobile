#!/usr/bin/env node
/**
 * List fluent-api operations the mobile client doesn't call yet, from the
 * API's published OpenAPI doc. Used when wiring Next UI screens
 * (docs/guides/figma-to-component.md → "Screens: wire to what exists").
 *
 * Usage: npm run api:coverage -- [--tag <substring>] [--all] [--spec <url>]
 * Matching is by path shape against string literals in src/services and
 * ignores the HTTP method, so a called path can hide an uncalled method on it.
 * Treat results as leads for a dev to confirm, not a verdict.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_SPEC = 'https://dev.api.fluent.bible/doc';

// Exit quietly when piped into `head` and similar.
process.stdout.on('error', error => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});
const SERVICES_DIR = 'src/services';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const specUrl = argValue('--spec') ?? DEFAULT_SPEC;
const tagFilter = argValue('--tag')?.toLowerCase();
const showAll = process.argv.includes('--all');

const normalize = p =>
  p.replace(/\$\{[^}]+\}|\{[^}]+\}/g, '{}').replace(/\/+$/, '');

const source = readdirSync(SERVICES_DIR)
  // aquiferApi.ts talks to a different API, so it can't count as fluent-api coverage.
  .filter(
    f => f.endsWith('.ts') && !f.includes('.test.') && f !== 'aquiferApi.ts',
  )
  .map(f => readFileSync(path.join(SERVICES_DIR, f), 'utf8'))
  .join('\n');
// Each client path becomes a pattern where `{}` matches any one segment, so
// multi-line template literals and `${kind}`-style segments still match.
const clientPatterns = [...source.matchAll(/[`'"](\/[a-zA-Z][^`'"?]*)/g)].map(
  m => {
    const p = normalize(m[1].replace(/\s+/g, '').replace(/\$\{[^}]*$/, ''));
    return new RegExp(
      `^${p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\}/g, '[^/]+')}$`,
    );
  },
);

const response = await fetch(specUrl);
if (!response.ok) {
  process.stderr.write(`Could not load ${specUrl} (${response.status})\n`);
  process.exit(1);
}
const spec = await response.json();

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

// Path items can also carry `parameters`, `summary` etc.; only count operations.
const rows = Object.entries(spec.paths).flatMap(([apiPath, ops]) =>
  Object.entries(ops)
    .filter(([method]) => HTTP_METHODS.has(method))
    .map(([method, op]) => ({
      called: clientPatterns.some(re => re.test(normalize(apiPath))),
      method: method.toUpperCase(),
      path: apiPath,
      tags: (op.tags ?? []).join(', '),
      summary: op.summary ?? '',
    })),
);
const filtered = rows.filter(
  r => !tagFilter || r.tags.toLowerCase().includes(tagFilter),
);
const notCalled = filtered.filter(r => !r.called);

process.stdout.write(
  `${filtered.length} operations · ${
    filtered.length - notCalled.length
  } called by mobile · ${notCalled.length} not called (${specUrl})\n`,
);
for (const r of showAll ? filtered : notCalled) {
  const mark = r.called ? 'called ' : 'missing';
  process.stdout.write(
    `${mark}  ${r.method.padEnd(6)} ${r.path}  [${r.tags}] ${r.summary}\n`,
  );
}
