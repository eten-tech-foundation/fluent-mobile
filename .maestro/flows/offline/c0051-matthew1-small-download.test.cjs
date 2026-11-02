/**
 * C-0051-06 offline static checks — no device, no Maestro run, no ADB.
 *
 * Dual-runner: Jest CI + `node --test` standalone.
 * Fixture-guard: expects BLOCKED (mutating, no chapter pin / no download
 * permission). Uses worktree guard if present, else trusted-repo parent guard.
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
  'c0051-matthew1-small-download-existing-session.yaml',
);
const fixture = path.join(
  root,
  '.maestro/fixtures/c0051-matthew1-small-download.manifest.json',
);
const worktreeGuard = path.join(root, 'scripts/maestro-fixture-guard.cjs');
const trustedRoot = path.resolve(root, '../..');
const trustedGuard = path.join(trustedRoot, 'scripts/maestro-fixture-guard.cjs');
const guardPath = fs.existsSync(worktreeGuard)
  ? worktreeGuard
  : fs.existsSync(trustedGuard)
    ? trustedGuard
    : null;
const guardPresent = Boolean(guardPath);

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

describe('C-0051-06 Matthew1 small download static contract', () => {
  it('parses ordered YAML + manifest', () => {
    const docs = loadYamlDocs(ordered);
    assert.ok(docs.length >= 1);
    const text = fs.readFileSync(ordered, 'utf8');
    assert.ok(text.includes('appId: com.eten.fluent'));
    assert.ok(fs.existsSync(fixture));
    const manifest = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    assert.equal(manifest.criterion, 'C-0051-06');
    assert.deepEqual(manifest.sourceIssues, [51, 717]);
    assert.equal(
      manifest.fixtureGuard.status,
      'NONADMISSIBLE_UNKNOWN_IMAGE_SIZES',
    );
    assert.equal(manifest.admission.id, 'c0051-matthew1-small');
    assert.equal(manifest.admission.maxBytes, 5242880);
    assert.deepEqual(manifest.admission.chaptersExact, [1]);
    assert.equal(manifest.admission.sizeCompleteness, 'incomplete-unknown-images');
    assert.equal(manifest.admission.admissionStatus, 'NONADMISSIBLE');
    assert.equal(manifest.admission.requireCompleteKnownSizes, true);
    assert.ok(manifest.payload.maxBytesSafetyBound <= 5242880);
    assert.equal(manifest.closesIfExecuted, null);
    assert.ok(
      manifest.payload.observedGroups.some(g =>
        (g.items || []).some(i => /\b0\s*B\b/i.test(String(i))),
      ),
    );
  });

  it('tags mutating+pfo-download existing-session (not ordered-readonly)', () => {
    const text = fs.readFileSync(ordered, 'utf8');
    assert.ok(/^\s*-\s*mutating\s*$/m.test(text));
    assert.ok(/^\s*-\s*pfo-download\s*$/m.test(text));
    assert.ok(/^\s*-\s*existing-session\s*$/m.test(text));
    assert.ok(/^\s*-\s*c0051-06\s*$/m.test(text));
    assert.ok(!/^\s*-\s*ordered-readonly\s*$/m.test(text));
    assert.ok(!/^\s*-\s*read-only\s*$/m.test(text));
  });

  it('nested runFlow file deps resolve (inline-only OK)', () => {
    const deps = [...collectRunFlowDeps(ordered)];
    for (const d of deps) {
      assert.ok(fs.existsSync(d), `missing nested flow: ${d}`);
    }
    // No external shared nav helpers that pull untagged ensure-no-modal.
    const body = fs.readFileSync(ordered, 'utf8');
    assert.ok(!body.includes('goto-home.yaml'));
    assert.ok(!body.includes('ensure-no-modal'));
    assert.ok(!body.includes('open-my-work-chapter'));
  });

  it('uses stable PFO download testIDs grounded in footer component', () => {
    const text = fs.readFileSync(ordered, 'utf8');
    for (const id of [
      'prepare-offline-screen',
      'prepare-offline-resources-section',
      'prepare-offline-download-footer',
      'prepare-offline-download-button',
      'prepare-offline-download-controls-downloading',
      'prepare-offline-download-pause',
      'prepare-offline-download-cancel',
      'prepare-offline-download-complete',
      'project-row-13',
      'settings-menu-account-9',
      'settings-menu-account-12',
    ]) {
      assert.ok(text.includes(id), `missing id ${id}`);
    }
    const footer = path.join(
      root,
      'src/app/prepare-offline/PrepareOfflineDownloadFooter.tsx',
    );
    const footerSrc = fs.readFileSync(footer, 'utf8');
    assert.ok(footerSrc.includes('prepare-offline-download-pause'));
    assert.ok(footerSrc.includes('prepare-offline-download-cancel'));
    assert.ok(footerSrc.includes('prepare-offline-download-complete'));
  });

  it('mutates via download-button id once; forbids bare Download / clearState / login', () => {
    const text = fs.readFileSync(ordered, 'utf8');
    const commands = text.replace(/^#.*$/gm, '');
    const taps = commands.match(
      /tapOn:\s*\n\s*id:\s*'prepare-offline-download-button'/g,
    );
    assert.ok(taps && taps.length === 1, `download taps=${taps && taps.length}`);
    assert.ok(!/tapOn:\s*\n\s*text:\s*'?\^?Download\$?'?/.test(commands));
    assert.ok(!/^\s*-\s*clearState\b/m.test(commands));
    assert.ok(!commands.includes('inputText:'));
    assert.ok(!commands.includes('eraseText'));
    assert.ok(!commands.includes('setAirplaneMode'));
    assert.ok(!commands.includes('toggleAirplaneMode'));
    // Exact live size cap before Download tap (not wildcard / GB).
    const tapIdx = commands.indexOf(
      "tapOn:\n    id: 'prepare-offline-download-button'",
    );
    assert.ok(tapIdx > 0);
    const before = commands.slice(0, tapIdx);
    assert.ok(before.includes("text: '^2\\.4 MB$'"));
    assert.ok(before.includes("text: '^Download 2\\.4 MB$'"));
    assert.ok(before.includes('enabled: true'));
  });

  it('Pause/Cancel observation is conditional; complete OR downloading required', () => {
    const text = fs.readFileSync(ordered, 'utf8');
    assert.ok(text.includes('optional: true'));
    assert.ok(
      text.includes(
        "output.c0051DownloadSurface == 'downloading' || output.c0051DownloadSurface == 'complete'",
      ),
    );
    // Pause assertions only under when: downloading-controls (not mandatory sole path).
    const pauseIdx = text.indexOf("id: 'prepare-offline-download-pause'");
    assert.ok(pauseIdx > 0);
    const beforePause = text.slice(0, pauseIdx);
    assert.ok(
      beforePause.lastIndexOf('when:') >
        beforePause.lastIndexOf('tapOn:\n    id: \'prepare-offline-download-button\''),
    );
    assert.ok(text.includes("id: 'prepare-offline-download-controls-downloading'"));
  });

  it('exits closed Home as PM9 after Download; no inline account-12 switch', () => {
    const text = fs.readFileSync(ordered, 'utf8');
    const commands = text.replace(/^#.*$/gm, '');
    const tapIdx = commands.indexOf(
      "tapOn:\n    id: 'prepare-offline-download-button'",
    );
    assert.ok(tapIdx > 0);
    const afterDownload = commands.slice(tapIdx);
    // Host owns active12 restore after settle — YAML must not switch.
    assert.ok(
      !/tapOn:\s*\n\s*id:\s*'settings-menu-account-12'/.test(afterDownload),
    );
    assert.ok(!afterDownload.includes("id: 'settings-menu-active-12'"));
    assert.ok(afterDownload.includes("id: 'settings-menu-active-9'"));
    assert.ok(afterDownload.includes('pressKey: Back'));
    assert.ok(!/^\s*-\s*(delete|wipe|clearCache)\b/im.test(commands));
    assert.ok(!/rm\s+-rf/i.test(commands));
  });

  it('host settles queue before bounded_ui_restore to account 12', () => {
    const host = fs.readFileSync(
      path.join(
        root,
        'scripts/qa717-easy-ui-batch/run-c0051-a5554-external-finally.py',
      ),
      'utf8',
    );
    // Call-site order inside run() (not def/docstring positions).
    const settleCall = host.indexOf('settle = wait_for_queue_settle(');
    const restoreCall = host.indexOf('d0702.bounded_ui_restore(');
    assert.ok(settleCall > 0, 'missing settle call');
    assert.ok(restoreCall > settleCall, 'restore must follow settle');
    assert.ok(host.includes('if settle.get("uiRestoreSafe")'));
    assert.ok(host.includes('ui-restore-skipped-transfer-not-safe'));
  });

  it('Selected chapters patterns are not over-escaped', () => {
    const text = fs.readFileSync(ordered, 'utf8');
    const patterns = [...text.matchAll(/text:\s*'([^']*Selected chapters[^']*)'/g)].map(
      m => m[1],
    );
    assert.ok(patterns.length >= 2);
    for (const p of patterns) {
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

  it('cache path matches downloadStorage project sandbox', () => {
    const manifest = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    assert.equal(manifest.ids.cacheDirRelative, 'files/downloads/');
    assert.equal(manifest.ids.newContentDirRelative, 'files/downloads/13/');
    assert.deepEqual(manifest.ids.preexistingCacheProjects, ['8', '12']);
    const storage = fs.readFileSync(
      path.join(root, 'src/services/downloadStorage.ts'),
      'utf8',
    );
    assert.ok(storage.includes('downloads/${projectId}/'));
  });
});

describe('C-0051-06 fixture-guard (authoring)', () => {
  const worktreeGuardPath = path.join(root, 'scripts/maestro-fixture-guard.cjs');
  const localGuard = fs.existsSync(worktreeGuardPath)
    ? worktreeGuardPath
    : guardPath;

  (localGuard ? it : itSkip)(
    'recursive preflight NONADMISSIBLE for original 2.4MB+Images0B env',
    () => {
      const { preflightFromArgv } = require(localGuard);
      const manifest = JSON.parse(fs.readFileSync(fixture, 'utf8'));
      const result = preflightFromArgv({
        argv: ['--device', 'emulator-5554', ordered],
        recursive: true,
        projectId: '13',
        allowlist: '13',
        denylist: '',
        fixtureEnv: manifest.fixtureGuard.env,
        cwd: root,
      });
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.match(
        result.reason || '',
        /NONADMISSIBLE|unknown|incomplete|sizeCompleteness|0 B/i,
      );
    },
  );

  (localGuard ? it : itSkip)(
    'recursive preflight PASS with known-complete bounded manifest',
    () => {
      const { preflightFromArgv } = require(localGuard);
      const result = preflightFromArgv({
        argv: ['--device', 'emulator-5554', ordered],
        recursive: true,
        projectId: '13',
        allowlist: '13',
        denylist: '',
        fixtureEnv: {
          MAESTRO_PFO_DOWNLOAD_ADMISSION: 'c0051-matthew1-known-complete',
          MAESTRO_PFO_DOWNLOAD_MANIFEST:
            '.maestro/fixtures/c0051-matthew1-known-complete-bounded.manifest.json',
          MAESTRO_FIXTURE_PROJECT_ID: '13',
          MAESTRO_FIXTURE_PROJECT_ALLOWLIST: '13',
        },
        cwd: root,
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.status, 'PASS');
    },
  );

  (localGuard ? it : itSkip)(
    'recursive preflight BLOCKED without admission env (default deny)',
    () => {
      const { preflightFromArgv } = require(localGuard);
      const result = preflightFromArgv({
        argv: ['--device', 'emulator-5554', ordered],
        recursive: true,
        projectId: '13',
        allowlist: '13',
        fixtureEnv: {},
        cwd: root,
      });
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.status, 'BLOCKED');
    },
  );
});
