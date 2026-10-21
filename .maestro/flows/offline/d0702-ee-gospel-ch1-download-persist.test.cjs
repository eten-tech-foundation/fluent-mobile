/**
 * D-0702-01 offline static checks — no device, no Maestro run, no ADB.
 *
 * Dual-runner registration (same file, same 7 contract assertions):
 *   - Jest CI (`npm test`): uses Jest globals so the suite is not empty
 *   - Standalone: `node --test .maestro/flows/offline/d0702-ee-gospel-ch1-download-persist.test.cjs`
 *
 * Optional authoring-only fixture-guard: explicit SKIP when absent (not a fake PASS).
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runningUnderJest = typeof jest !== 'undefined';
const harness = runningUnderJest
  ? { describe: global.describe, it: global.it }
  : require('node:test');
const { describe, it } = harness;
const itSkip =
  typeof it.skip === 'function'
    ? it.skip.bind(it)
    : (name, fn) => it(name, { skip: true }, fn);

const root = path.resolve(__dirname, '../../..');
const ordered = path.join(
  __dirname,
  'd0702-ee-gospel-ch1-download-persist-existing-session.yaml',
);
const nested = path.join(__dirname, 'd0702-book-ch1-unavailable-persist.yaml');
const availableAssert = path.join(
  __dirname,
  'd0702-assert-hydration-available.yaml',
);
const unavailableAssert = path.join(
  __dirname,
  'd0702-assert-hydration-unavailable.yaml',
);
const fixture = path.join(
  root,
  '.maestro/fixtures/d0702-ee-gospel-project13.manifest.json',
);
const guardPath = path.join(root, 'scripts/maestro-fixture-guard.cjs');
const guardPresent = fs.existsSync(guardPath);
const allFlowYaml = [ordered, nested, availableAssert, unavailableAssert];

const UNAVAILABLE =
  "Couldn't load downloadable resources for the selected chapters. Check your connection and try again.";

function loadYamlDocs(file) {
  try {
    const yaml = require('js-yaml');
    return yaml.loadAll(fs.readFileSync(file, 'utf8'));
  } catch {
    const raw = fs.readFileSync(file, 'utf8');
    const parts = raw.split(/^---\s*$/m);
    return parts.map((p, i) => ({ _rawPart: i, _text: p }));
  }
}

function collectRunFlowDeps(entryFile, seen = new Set()) {
  const abs = path.resolve(entryFile);
  if (seen.has(abs)) return seen;
  seen.add(abs);
  if (!fs.existsSync(abs)) {
    throw new Error(`missing flow: ${abs}`);
  }
  const body = fs.readFileSync(abs, 'utf8');
  const dir = path.dirname(abs);
  const re = /^\s*-\s+runFlow:\s+(?:file:\s+)?["']?([^"'#\n]+?)["']?\s*$/gm;
  let m;
  while ((m = re.exec(body))) {
    const target = m[1].trim();
    if (!target.endsWith('.yaml') && !target.endsWith('.yml')) continue;
    collectRunFlowDeps(path.resolve(dir, target), seen);
  }
  const fileRe = /^\s+file:\s+["']?([^"'#\n]+\.ya?ml)["']?\s*$/gm;
  while ((m = fileRe.exec(body))) {
    collectRunFlowDeps(path.resolve(dir, m[1].trim()), seen);
  }
  return seen;
}

describe('D-0702-01 durable wrapper static contract', () => {
  it('parses ordered + nested YAML', () => {
    const o = loadYamlDocs(ordered);
    const n = loadYamlDocs(nested);
    assert.ok(o.length >= 1);
    assert.ok(n.length >= 1);
    const oText = fs.readFileSync(ordered, 'utf8');
    const nText = fs.readFileSync(nested, 'utf8');
    assert.ok(oText.includes('appId: com.eten.fluent'));
    assert.ok(nText.includes('appId: com.eten.fluent'));
  });

  it('tags are read-only existing-session (not mutating)', () => {
    const oText = fs.readFileSync(ordered, 'utf8');
    const nText = fs.readFileSync(nested, 'utf8');
    assert.ok(/^\s*-\s*ordered-readonly\s*$/m.test(oText));
    assert.ok(/^\s*-\s*read-only\s*$/m.test(oText));
    assert.ok(/^\s*-\s*existing-session\s*$/m.test(oText));
    assert.ok(!/^\s*-\s*mutating\s*$/m.test(oText));
    assert.ok(/^\s*-\s*ordered-readonly\s*$/m.test(nText));
    assert.ok(!/^\s*-\s*mutating\s*$/m.test(nText));
  });

  it('maps A/B hydration terminals (not unavailable-only) and forbids bare Download', () => {
    const nestedBody = fs.readFileSync(nested, 'utf8');
    const avail = fs.readFileSync(availableAssert, 'utf8');
    const unavail = fs.readFileSync(unavailableAssert, 'utf8');
    assert.ok(nestedBody.includes('d0702-assert-hydration-available.yaml'));
    assert.ok(nestedBody.includes('d0702-assert-hydration-unavailable.yaml'));
    assert.ok(nestedBody.includes('output.d0702HydrationBranch'));
    // Bounded scrollUntilVisible waits (not N×animation busy-loop).
    assert.ok(nestedBody.includes('scrollUntilVisible:'));
    assert.ok(nestedBody.includes("id: 'prepare-offline-resources-section'"));
    assert.ok(/timeout:\s*45000/.test(nestedBody));
    assert.ok(
      !/times:\s*90/.test(nestedBody),
      'must not use 90× animation poll',
    );
    assert.ok(nestedBody.includes("'^Chapter 1$'"));
    assert.ok(nestedBody.includes("'^Total download$'"));
    assert.ok(nestedBody.includes("'^Download .+$'"));
    assert.ok(!/text:\s*'?\^Download\$'?/.test(nestedBody + avail + unavail));
    // Available branch: scroll-ordered full suite, not one weak element.
    assert.ok(avail.includes('scrollUntilVisible:'));
    assert.ok(avail.includes("id: 'prepare-offline-resources-section'"));
    assert.ok(avail.includes("'^RESOURCES TO DOWNLOAD$'"));
    assert.ok(avail.includes("id: 'prepare-offline-resource-summary'"));
    assert.ok(avail.includes("id: 'resource-tier-1'"));
    assert.ok(avail.includes("'^Source Bible$'"));
    assert.ok(avail.includes("'^Translation Notes$'"));
    assert.ok(avail.includes('enabled: true'));
    assert.ok(avail.includes("'^Download (?!0 B$).+$'"));
    assert.ok(avail.includes("id: 'prepare-offline-footer-hint'"));
    // Resources asserts appear before footer CTA scroll in the available file.
    assert.ok(
      avail.indexOf("id: 'prepare-offline-resources-section'") <
        avail.indexOf("id: 'prepare-offline-download-button'"),
    );
    // Unavailable branch: exact message + disabled + 0 B + no resources section.
    assert.ok(unavail.includes("Couldn''t load downloadable resources"));
    assert.ok(unavail.includes("id: 'prepare-offline-footer-hint'"));
    assert.ok(unavail.includes("'^Download 0 B$'"));
    assert.ok(unavail.includes("'^0 B$'"));
    assert.ok(unavail.includes('enabled: false'));
    assert.ok(
      /assertNotVisible:\s*\n\s*id: 'prepare-offline-resources-section'/m.test(
        unavail,
      ),
    );
    try {
      const yaml = require('js-yaml');
      const docs = yaml.loadAll(unavail);
      const texts = [];
      (function walk(o) {
        if (typeof o === 'string') texts.push(o);
        else if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') Object.values(o).forEach(walk);
      })(docs);
      const msg = texts.find(t =>
        t.includes('load downloadable resources for the selected chapters'),
      );
      assert.ok(msg);
      assert.ok(new RegExp(msg).test(UNAVAILABLE));
    } catch (err) {
      if (err && err.code === 'MODULE_NOT_FOUND') return;
      throw err;
    }
  });

  it('ordered wrapper sequences Matthew/Mark/Luke + project13 + restore12', () => {
    const body = fs.readFileSync(ordered, 'utf8');
    assert.ok(body.includes("id: '^project-row-13$'"));
    assert.ok(body.includes('settings-menu-account-9'));
    assert.ok(body.includes('settings-menu-account-12'));
    assert.ok(body.includes('settings-menu-active-12'));
    assert.ok(body.includes("id: 'settings-drawer-content'"));
    assert.ok(
      /assertNotVisible:\s*\n\s*id: 'settings-drawer-content'/m.test(body),
      'entry must require drawer closed before gear tap',
    );
    assert.ok(body.includes('Expand Matthew'));
    assert.ok(body.includes('Expand Mark'));
    assert.ok(body.includes('Expand Luke'));
    assert.ok(body.includes('d0702-book-ch1-unavailable-persist.yaml'));
    assert.ok(!/^\s*-\s*runFlow:.*pfo-download-button-persist/m.test(body));
    assert.ok(!/^\s*-\s*runScript:.*pfo-selector-values/m.test(body));
    assert.ok(!/^\s*-\s*runFlow:.*goto-home/m.test(body));
  });

  it('forbids hardware/auth/download mutation commands in authored YAML', () => {
    for (const file of allFlowYaml) {
      const body = fs.readFileSync(file, 'utf8');
      assert.ok(!/^\s*-\s*clearState\b/m.test(body));
      assert.ok(!/^\s*-\s*launchApp\b/m.test(body));
      assert.ok(!/^\s*-\s*setAirplaneMode\b/m.test(body));
      assert.ok(!/^\s*-\s*toggleAirplaneMode\b/m.test(body));
      assert.ok(!/ensure-on-login|login-happy|ensure-warm/i.test(body));
      assert.ok(
        !/tapOn:\s*\n\s*id: ['"]prepare-offline-download-button['"]/m.test(body),
      );
    }
  });

  it('fixture manifest pins project13 books and out-of-scope arithmetic', () => {
    const manifest = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    assert.equal(manifest.criterion, 'D-0702-01');
    assert.equal(manifest.project.id, '13');
    assert.equal(manifest.project.milestoneId, 21);
    assert.deepEqual(
      manifest.project.books.map(b => b.name),
      ['Matthew', 'Mark', 'Luke'],
    );
    assert.ok(manifest.outOfScope.some(s => /arithmetic|API431|C51/i.test(s)));
    assert.equal(manifest.chrome.unavailableHint, UNAVAILABLE);
  });

  it('nested runFlow closure resolves on disk (device-free)', () => {
    const deps = collectRunFlowDeps(ordered);
    assert.ok(deps.has(path.resolve(ordered)));
    assert.ok(deps.has(path.resolve(nested)));
    assert.ok(deps.has(path.resolve(availableAssert)));
    assert.ok(deps.has(path.resolve(unavailableAssert)));
    for (const file of deps) {
      assert.ok(fs.existsSync(file), file);
    }
  });

  it('resources-section is conditional (zero vs available); zero oracle stays footer/books', () => {
    const o = fs.readFileSync(ordered, 'utf8');
    const n = fs.readFileSync(nested, 'utf8');
    const avail = fs.readFileSync(availableAssert, 'utf8');
    // Parent zero-selection readiness must not wait on resources-section.
    const oCommands = o.replace(/^#.*$/gm, '');
    assert.ok(
      !/extendedWaitUntil:[\s\S]*?prepare-offline-resources-section/.test(
        oCommands,
      ),
      'ordered must not wait resources-section at zero selection',
    );
    assert.ok(o.includes("id: 'prepare-offline-download-footer'"));
    assert.ok(o.includes("'^Selected chapters \\(0\\)$'"));
    assert.ok(o.includes("'^Matthew, 0 of 28 chapters selected$'"));
    assert.ok(o.includes("'^Mark, 0 of 16 chapters selected$'"));
    assert.ok(o.includes("'^Luke, 0 of 24 chapters selected$'"));
    // Nested polls section as available terminal; available assert requires it.
    assert.ok(n.includes("id: 'prepare-offline-resources-section'"));
    assert.ok(avail.includes("id: 'prepare-offline-resources-section'"));
    assert.ok(n.includes('checked: false'));
    assert.ok(n.includes('checked: true'));
    assert.ok(
      !o.includes("'^Selected chapters \\\\(") &&
        !n.includes("'^Selected chapters \\\\("),
      'Selected chapters must not use double-backslash paren escapes',
    );
  });

  it('authored regexes match retained hierarchy labels (exact strings)', () => {
    // Exact labels from retained dumps + step-066 available hierarchy +
    // reconciliation unavailable message. Not imitation.
    const retainedByPattern = [
      ['^Selected chapters \\(0\\)$', 'Selected chapters (0)'],
      ['^Selected chapters \\([0-9]+\\)$', 'Selected chapters (0)'],
      ['^Selected chapters \\([0-9]+\\)$', 'Selected chapters (1)'],
      ['^Selected chapters \\([1-9][0-9]*\\)$', 'Selected chapters (1)'],
      ['^Matthew, 0 of 28 chapters selected$', 'Matthew, 0 of 28 chapters selected'],
      ['^Matthew, 1 of 28 chapters selected$', 'Matthew, 1 of 28 chapters selected'],
      ['^Mark, 0 of 16 chapters selected$', 'Mark, 0 of 16 chapters selected'],
      ['^Mark, 1 of 16 chapters selected$', 'Mark, 1 of 16 chapters selected'],
      ['^Luke, 0 of 24 chapters selected$', 'Luke, 0 of 24 chapters selected'],
      ['^Luke, 1 of 24 chapters selected$', 'Luke, 1 of 24 chapters selected'],
      ['^Expand Matthew$', 'Expand Matthew'],
      ['^Collapse Matthew$', 'Collapse Matthew'],
      ['^Expand Mark$', 'Expand Mark'],
      ['^Collapse Mark$', 'Collapse Mark'],
      ['^Expand Luke$', 'Expand Luke'],
      ['^Collapse Luke$', 'Collapse Luke'],
      ['^Chapter 1$', 'Chapter 1'],
      ['^Total download$', 'Total download'],
      ['^Download .+$', 'Download 0 B'],
      ['^Download .+$', 'Download 2.4 MB'],
      ['^Download (?!0 B$).+$', 'Download 2.4 MB'],
      ['^Download 0 B$', 'Download 0 B'],
      ['^0 B$', '0 B'],
      ['^RESOURCES TO DOWNLOAD$', 'RESOURCES TO DOWNLOAD'],
      ['^Source Bible$', 'Source Bible'],
      ['^Translation Notes$', 'Translation Notes'],
      ['^TIER 1 — REQUIRED$', 'TIER 1 — REQUIRED'],
      ['^\\d+(\\.\\d+)? (KB|MB)$', '1.7 MB'],
      ['^\\d+(\\.\\d+)? (KB|MB)$', '70 KB'],
      ['^(?!0 B$)\\d+(\\.\\d+)? (B|KB|MB|GB)$', '2.4 MB'],
      [
        '^Loading resources for the selected chapters…$',
        'Loading resources for the selected chapters…',
      ],
    ];
    const yaml = require('js-yaml');
    const docs = [
      ...yaml.loadAll(fs.readFileSync(ordered, 'utf8')),
      ...yaml.loadAll(fs.readFileSync(nested, 'utf8')),
      ...yaml.loadAll(fs.readFileSync(availableAssert, 'utf8')),
      ...yaml.loadAll(fs.readFileSync(unavailableAssert, 'utf8')),
    ];
    const patterns = [];
    (function walk(o) {
      if (typeof o === 'string' && o.startsWith('^') && o.endsWith('$')) {
        patterns.push(o);
      } else if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') Object.values(o).forEach(walk);
    })(docs);
    for (const [re, label] of retainedByPattern) {
      assert.ok(patterns.includes(re), `YAML missing pattern ${re}`);
      assert.ok(new RegExp(re).test(label), `${re} !~ ${JSON.stringify(label)}`);
    }
    const unavailablePat = patterns.find(p =>
      p.includes('load downloadable resources for the selected chapters'),
    );
    assert.ok(unavailablePat);
    assert.ok(new RegExp(unavailablePat).test(UNAVAILABLE));
    assert.ok(!new RegExp('^Download .+$').test('Download'));
    assert.ok(!new RegExp('^Download (?!0 B$).+$').test('Download 0 B'));
    assert.ok(
      !new RegExp('^Selected chapters \\(0\\)$').test('Selected chapters (1)'),
    );
    assert.ok(
      !new RegExp('^Selected chapters \\([1-9][0-9]*\\)$').test(
        'Selected chapters (0)',
      ),
    );
    for (const p of patterns.filter(x => x.includes('Selected chapters'))) {
      assert.ok(
        !p.includes('\\\\('),
        `over-escaped Selected chapters pattern: ${JSON.stringify(p)}`,
      );
      assert.ok(
        new RegExp(p).test('Selected chapters (0)') ||
          new RegExp(p).test('Selected chapters (1)'),
      );
    }
  });
});

describe('D-0702-01 optional fixture-guard (authoring-only)', () => {
  (guardPresent ? it : itSkip)(
    'recursive preflight PASS when maestro-fixture-guard.cjs present',
    () => {
      const { preflightFromArgv } = require(guardPath);
      const result = preflightFromArgv({
        argv: ['--device', 'emulator-5554', ordered],
        recursive: true,
        fixtureEnv: {},
        cwd: root,
      });
      assert.equal(result.ok, true, result.reason || JSON.stringify(result));
      assert.equal(result.status, 'PASS');
    },
  );
});
