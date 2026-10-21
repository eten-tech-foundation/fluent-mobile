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
const fixture = path.join(
  root,
  '.maestro/fixtures/d0702-ee-gospel-project13.manifest.json',
);
const guardPath = path.join(root, 'scripts/maestro-fixture-guard.cjs');
const guardPresent = fs.existsSync(guardPath);

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

  it('maps exact unavailable criterion and forbids bare Download', () => {
    const body = fs.readFileSync(nested, 'utf8');
    assert.ok(
      body.includes('load downloadable resources for the selected chapters'),
    );
    assert.ok(body.includes("Couldn''t load downloadable resources"));
    assert.ok(body.includes("'^Download .+$'"));
    assert.ok(!/text:\s*'?\^Download\$'?/.test(body));
    assert.ok(body.includes('enabled: false'));
    assert.ok(body.includes("'^Total download$'"));
    assert.ok(body.includes("'^Chapter 1$'"));
    assert.ok(body.includes('prepare-offline-footer-hint'));
    assert.ok(
      body.includes('Loading resources for the selected chapters'),
      'must wait out loading settlement before unavailable assert',
    );
    try {
      const yaml = require('js-yaml');
      const docs = yaml.loadAll(body);
      const texts = [];
      (function walk(o) {
        if (typeof o === 'string') texts.push(o);
        else if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') Object.values(o).forEach(walk);
      })(docs);
      const unavailableAssert = texts.find(t =>
        t.includes('load downloadable resources for the selected chapters'),
      );
      assert.ok(unavailableAssert);
      assert.ok(new RegExp(unavailableAssert).test(UNAVAILABLE));
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
    for (const file of [ordered, nested]) {
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
    for (const file of deps) {
      assert.ok(fs.existsSync(file), file);
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
