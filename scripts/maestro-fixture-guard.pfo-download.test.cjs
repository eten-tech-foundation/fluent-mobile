/**
 * Focused PFO download admission regressions — default deny retained.
 * No device. Uses vendored guard in this worktree.
 *
 * Dual-runner: Jest CI + `node --test` standalone (same pattern as
 * `.maestro/flows/offline/*-download*.test.cjs`).
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

const root = path.resolve(__dirname, '..');
const {
  preflightFromArgv,
  evaluateChapterPreflight,
  evaluateObservedSizeCompleteness,
  loadPfoDownloadManifest,
} = require('./maestro-fixture-guard.cjs');

const flow = path.join(
  root,
  '.maestro/flows/offline/c0051-matthew1-small-download-existing-session.yaml',
);
const originalManifestRel =
  '.maestro/fixtures/c0051-matthew1-small-download.manifest.json';
const knownCompleteManifestRel =
  '.maestro/fixtures/c0051-matthew1-known-complete-bounded.manifest.json';
/** @deprecated original 2.4MB+Images0B fixture — NONADMISSIBLE */
const manifestRel = originalManifestRel;

const originalEnv = {
  MAESTRO_PFO_DOWNLOAD_ADMISSION: 'c0051-matthew1-small',
  MAESTRO_PFO_DOWNLOAD_MANIFEST: originalManifestRel,
  MAESTRO_FIXTURE_PROJECT_ID: '13',
  MAESTRO_FIXTURE_PROJECT_ALLOWLIST: '13',
};

const goodEnv = {
  MAESTRO_PFO_DOWNLOAD_ADMISSION: 'c0051-matthew1-known-complete',
  MAESTRO_PFO_DOWNLOAD_MANIFEST: knownCompleteManifestRel,
  MAESTRO_FIXTURE_PROJECT_ID: '13',
  MAESTRO_FIXTURE_PROJECT_ALLOWLIST: '13',
};

function run(envOverrides = {}, flowPath = flow) {
  return preflightFromArgv({
    chapterId: '',
    projectId: envOverrides.MAESTRO_FIXTURE_PROJECT_ID || goodEnv.MAESTRO_FIXTURE_PROJECT_ID,
    allowlist:
      envOverrides.MAESTRO_FIXTURE_PROJECT_ALLOWLIST ||
      goodEnv.MAESTRO_FIXTURE_PROJECT_ALLOWLIST,
    denylist: envOverrides.MAESTRO_FIXTURE_PROJECT_DENYLIST || '',
    argv: ['--device', 'emulator-5554', flowPath],
    recursive: true,
    fixtureEnv: { ...goodEnv, ...envOverrides },
    cwd: root,
  });
}

describe('pfo-download admission — exact fixture', () => {
  it('PASSes recursive preflight for known-complete bounded manifest', () => {
    const result = run();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.status, 'PASS');
  });

  it('loads known-complete manifest admission constraints', () => {
    const loaded = loadPfoDownloadManifest(goodEnv, fs, path, root);
    assert.equal(loaded.ok, true, JSON.stringify(loaded));
    assert.equal(loaded.adm.maxBytes, 5242880);
    assert.deepEqual(loaded.adm.chaptersExact, [1]);
    assert.equal(loaded.adm.sizeCompleteness, 'all-known-complete');
  });

  it('NONADMISSIBLE: original 2.4MB + Reference Images 0 B fixture', () => {
    const loaded = loadPfoDownloadManifest(originalEnv, fs, path, root);
    assert.equal(loaded.ok, false, JSON.stringify(loaded));
    assert.match(
      String(loaded.status || '') + String(loaded.reason || ''),
      /NONADMISSIBLE|unknown|incomplete|0 B|sizeCompleteness/i,
    );
    const blocked = preflightFromArgv({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      argv: ['--device', 'emulator-5554', flow],
      recursive: true,
      fixtureEnv: originalEnv,
      cwd: root,
    });
    assert.equal(blocked.ok, false, JSON.stringify(blocked));
    assert.match(
      blocked.reason || '',
      /NONADMISSIBLE|unknown|incomplete|sizeCompleteness|0 B/i,
    );
  });
});

describe('pfo-download admission — negatives (default deny)', () => {
  it('BLOCKED without admission env (mutating still unpinned)', () => {
    const yaml = fs.readFileSync(flow, 'utf8');
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: flow, yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: {},
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /MAESTRO_PFO_DOWNLOAD_ADMISSION|pfo-download/);
  });

  it('BLOCKED wrong project id', () => {
    const result = run({
      MAESTRO_FIXTURE_PROJECT_ID: '12',
      MAESTRO_FIXTURE_PROJECT_ALLOWLIST: '12',
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /projectId|13/);
  });

  it('BLOCKED wrong allowlist excluding 13', () => {
    const result = run({
      MAESTRO_FIXTURE_PROJECT_ALLOWLIST: '8',
    });
    assert.equal(result.ok, false);
  });

  it('BLOCKED admission id mismatch', () => {
    const result = run({ MAESTRO_PFO_DOWNLOAD_ADMISSION: 'other-id' });
    assert.equal(result.ok, false);
    assert.match(result.reason, /id mismatch/);
  });

  it('BLOCKED missing manifest', () => {
    const result = run({
      MAESTRO_PFO_DOWNLOAD_MANIFEST: '.maestro/fixtures/does-not-exist.json',
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /manifest not found/);
  });

  it('BLOCKED mutating without pfo-download tag (default deny)', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .replace(/^\s*-\s*pfo-download\s*$/m, '');
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'synthetic-no-tag.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /MAESTRO_FIXTURE_CHAPTER_ID/);
  });

  it('BLOCKED wrong project row in body', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .replace(/project-row-13/g, 'project-row-12');
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'wrong-project.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /non-admitted project|missing project-row-13/);
  });

  it('BLOCKED wrong actor account', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .replace(/settings-menu-account-9/g, 'settings-menu-account-8');
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'wrong-account.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /actor account 9/);
  });

  it('BLOCKED tap of non-admitted account while actor account present', () => {
    const yaml =
      fs.readFileSync(flow, 'utf8') +
      "\n- tapOn:\n    id: 'settings-menu-account-12'\n";
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'non-admitted-account-tap.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /non-admitted account/);
  });

  it('BLOCKED other chapter tap', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .replace(
        "text: '^Chapter 1$'\n    waitToSettleTimeoutMs: 500",
        "text: '^Chapter 2$'\n    waitToSettleTimeoutMs: 500",
      );
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'wrong-chapter.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /Chapter 2/);
  });

  it('BLOCKED double-quoted other chapter tap', () => {
    const yaml =
      fs.readFileSync(flow, 'utf8') +
      '\n- tapOn:\n    text: "^Chapter 2$"\n';
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'double-quoted-chapter.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /Chapter 2/);
  });

  it('BLOCKED Expand Mark (wrong book)', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .replace(/Expand Matthew/g, 'Expand Mark')
      .replace(/Collapse Matthew/g, 'Collapse Mark');
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'wrong-book.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /non-Matthew|Matthew chapter 1/);
  });

  it('BLOCKED clearState nested mutation', () => {
    const yaml =
      fs.readFileSync(flow, 'utf8') + '\n- clearState\n';
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'clear-state.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /forbidden/);
  });

  it('BLOCKED oversize maxBytes in mutated manifest copy', () => {
    const tmp = path.join(root, '.maestro/fixtures/_tmp-oversize-c0051.json');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, knownCompleteManifestRel), 'utf8'),
    );
    manifest.admission.maxBytes = 9 * 1024 * 1024;
    fs.writeFileSync(tmp, JSON.stringify(manifest));
    try {
      const result = run({
        MAESTRO_PFO_DOWNLOAD_MANIFEST: path.relative(root, tmp),
      });
      assert.equal(result.ok, false);
      assert.match(result.reason, /maxBytes/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('BLOCKED incomplete/missing size metadata (no observedGroups)', () => {
    const tmp = path.join(root, '.maestro/fixtures/_tmp-incomplete-meta.json');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, knownCompleteManifestRel), 'utf8'),
    );
    delete manifest.payload.observedGroups;
    manifest.admission.sizeCompleteness = 'all-known-complete';
    fs.writeFileSync(tmp, JSON.stringify(manifest));
    try {
      const result = run({
        MAESTRO_PFO_DOWNLOAD_MANIFEST: path.relative(root, tmp),
      });
      assert.equal(result.ok, false);
      assert.match(result.reason, /observedGroups|incomplete|oracle/i);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('BLOCKED sizeCompleteness missing even with positive aggregate label', () => {
    const tmp = path.join(root, '.maestro/fixtures/_tmp-agg-only.json');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, knownCompleteManifestRel), 'utf8'),
    );
    delete manifest.admission.sizeCompleteness;
    delete manifest.payload.sizeCompleteness;
    manifest.admission.observedUiTotalLabel = '2.4 MB';
    fs.writeFileSync(tmp, JSON.stringify(manifest));
    try {
      const result = run({
        MAESTRO_PFO_DOWNLOAD_MANIFEST: path.relative(root, tmp),
      });
      assert.equal(result.ok, false);
      assert.match(result.reason, /sizeCompleteness|NONADMISSIBLE/i);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('allows Included / genuine known zero in observed groups', () => {
    const tmp = path.join(root, '.maestro/fixtures/_tmp-included-zero.json');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, knownCompleteManifestRel), 'utf8'),
    );
    manifest.payload.observedGroups = [
      { name: 'Source Bible', items: ['Text Included', 'Audio 1.7 MB'], tier: 1 },
      { name: 'Empty placeholder', items: ['Text 0 B'], tier: 3 },
    ];
    // Genuine known-zero without network Image 0 B still blocked by 0 B rule —
    // only Included may be zero. Document: true cached/included uses Included.
    fs.writeFileSync(tmp, JSON.stringify(manifest));
    try {
      const blockedZero = run({
        MAESTRO_PFO_DOWNLOAD_MANIFEST: path.relative(root, tmp),
      });
      assert.equal(blockedZero.ok, false);
      assert.match(blockedZero.reason, /0 B|unknown/i);

      manifest.payload.observedGroups = [
        { name: 'Source Bible', items: ['Text Included', 'Audio 1.7 MB'], tier: 1 },
        { name: 'Translation Notes', items: ['Text 70 KB'], tier: 1 },
      ];
      fs.writeFileSync(tmp, JSON.stringify(manifest));
      const okIncluded = run({
        MAESTRO_PFO_DOWNLOAD_MANIFEST: path.relative(root, tmp),
      });
      assert.equal(okIncluded.ok, true, JSON.stringify(okIncluded));
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  it('NONADMISSIBLE: Image Included 0 B before Included skip', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, knownCompleteManifestRel), 'utf8'),
    );
    manifest.payload.observedGroups = [
      { name: 'Source Bible', items: ['Text Included', 'Audio 1.7 MB'], tier: 1 },
      { name: 'Reference Images', items: ['Image Included 0 B'], tier: 3 },
    ];
    const result = evaluateObservedSizeCompleteness(manifest);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.status, 'NONADMISSIBLE');
    assert.match(result.reason, /0 B|unknown|Image Included 0 B/i);
  });

  it('NONADMISSIBLE: non-Included label without positive size token', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, knownCompleteManifestRel), 'utf8'),
    );
    manifest.payload.observedGroups = [
      { name: 'Source Bible', items: ['Text Included', 'Audio'], tier: 1 },
    ];
    const result = evaluateObservedSizeCompleteness(manifest);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.status, 'NONADMISSIBLE');
    assert.match(result.reason, /no known size/i);
  });

  it('BLOCKED unknown-size / removed exact assert', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .split("text: '^2\\.4 MB$'")
      .join("text: '^(?!0 B$)\\d+(\\.\\d+)? (B|KB|MB|GB)$'")
      .split("text: '^Download 2\\.4 MB$'")
      .join("text: '^Download (?!0 B$).+$'");
    assert.ok(yaml.includes('(?!0 B$)'));
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'unknown-size.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /exact total|non-exact|oversized/);
  });

  it('BLOCKED mutated 999 GB size assert before tap', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .split("text: '^2\\.4 MB$'")
      .join("text: '^999 GB$'")
      .split("text: '^Download 2\\.4 MB$'")
      .join("text: '^Download 999 GB$'");
    assert.ok(yaml.includes('999 GB'));
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'oversize-999.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /exact total|non-exact|oversized/);
  });

  it('BLOCKED removed exact size asserts entirely', () => {
    const yaml = fs
      .readFileSync(flow, 'utf8')
      .split("text: '^2\\.4 MB$'")
      .join("text: '^REMOVED$'")
      .split("text: '^Download 2\\.4 MB$'")
      .join("text: '^REMOVED$'");
    const result = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [{ path: 'no-size.yaml', yaml }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /exact total/);
  });

  it('ALWAYS assertProjectAllowed when mixing pfo-download + other mutating', () => {
    const pfoYaml = fs.readFileSync(flow, 'utf8');
    const pinned = `tags:
  - mutating
---
- runFlow: ../../shared/nav/open-my-work-chapter.yaml
`;
    const denied = evaluateChapterPreflight({
      chapterId: '42',
      projectId: '5',
      allowlist: '5,13',
      denylist: '5',
      flows: [
        { path: flow, yaml: pfoYaml },
        { path: 'pinned-mutating.yaml', yaml: pinned },
      ],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: {
        ...goodEnv,
        MAESTRO_FIXTURE_PROJECT_ID: '5',
      },
      cwd: root,
    });
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /denylisted|ALLOWLIST|project/);

    const mixedUnpinned = evaluateChapterPreflight({
      chapterId: '',
      projectId: '13',
      allowlist: '13',
      denylist: '',
      flows: [
        { path: flow, yaml: pfoYaml },
        {
          path: 'extra-mutating.yaml',
          yaml: `tags:\n  - mutating\n---\n- tapOn:\n    id: 'home-settings-button'\n`,
        },
      ],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: goodEnv,
      cwd: root,
    });
    assert.equal(mixedUnpinned.ok, false);
    assert.match(mixedUnpinned.reason, /MAESTRO_FIXTURE_CHAPTER_ID/);
  });

  it('non-PFO chapter pin checks retained (pinned mutating still needs chapter id)', () => {
    const pinned = `tags:
  - mutating
---
- runFlow: ../../shared/nav/open-my-work-chapter.yaml
`;
    const emptyChapter = evaluateChapterPreflight({
      chapterId: '',
      projectId: '6',
      allowlist: '6',
      denylist: '',
      flows: [{ path: 'pinned.yaml', yaml: pinned }],
      includeTags: [],
      excludeTags: [],
      fixtureEnv: {},
      cwd: root,
    });
    assert.equal(emptyChapter.ok, false);
    assert.match(emptyChapter.reason, /MAESTRO_FIXTURE_CHAPTER_ID is empty/);
  });
});
