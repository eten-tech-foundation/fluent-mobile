/**
 * Fixture-guard compatibility for shared nav/ensure helpers — no device.
 *
 * Ordered journeys run `maestro-fixture-guard.cjs --preflight --recursive`,
 * which walks every nested runFlow and refuses unclassified action helpers.
 *
 * Dual-runner: Jest CI + `node --test` standalone.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runningUnderJest = typeof jest !== 'undefined';
const { describe, it } = runningUnderJest
  ? { describe: global.describe, it: global.it }
  : require('node:test');

const root = path.resolve(__dirname, '../../..');
const { preflightFromArgv } = require(
  path.join(root, 'scripts/maestro-fixture-guard.cjs'),
);
const shared = path.join(root, '.maestro/shared');

function journeyNesting(helper) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-guard-'));
  const file = path.join(dir, 'journey.yaml');
  fs.writeFileSync(
    file,
    [
      'appId: com.eten.fluent',
      'tags:',
      '  - ordered-readonly',
      '---',
      `- runFlow: ${path.join(shared, helper)}`,
      '',
    ].join('\n'),
  );
  return file;
}

function recursive(helper, env = {}) {
  return preflightFromArgv({
    chapterId: env.MAESTRO_FIXTURE_CHAPTER_ID,
    milestoneId: env.MAESTRO_FIXTURE_MILESTONE_ID,
    argv: [journeyNesting(helper)],
    recursive: true,
    fixtureEnv: env,
  });
}

describe('open-my-work-chapter in ordered journeys', () => {
  it('passes recursive preflight with a chapter pin', () => {
    const result = recursive('nav/open-my-work-chapter.yaml', {
      MAESTRO_FIXTURE_CHAPTER_ID: '12',
    });
    assert.equal(result.reason, '');
    assert.equal(result.ok, true);
  });

  it('blocks without MAESTRO_FIXTURE_CHAPTER_ID', () => {
    const result = recursive('nav/open-my-work-chapter.yaml');
    assert.equal(result.ok, false);
    assert.match(result.reason, /MAESTRO_FIXTURE_CHAPTER_ID is empty/);
  });
});

describe('open-fixture-chapter-from-milestone in ordered journeys', () => {
  it('passes with milestone and chapter pins', () => {
    const result = recursive('nav/open-fixture-chapter-from-milestone.yaml', {
      MAESTRO_FIXTURE_CHAPTER_ID: '12',
      MAESTRO_FIXTURE_MILESTONE_ID: '5',
    });
    assert.equal(result.reason, '');
    assert.equal(result.ok, true);
  });

  it('blocks without a milestone pin', () => {
    const result = recursive('nav/open-fixture-chapter-from-milestone.yaml', {
      MAESTRO_FIXTURE_CHAPTER_ID: '12',
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /MAESTRO_FIXTURE_MILESTONE_ID/);
  });
});

describe('readonly nav helpers in ordered journeys', () => {
  for (const helper of ['nav/goto-home.yaml', 'nav/goto-sync.yaml']) {
    it(`${helper} passes recursive preflight`, () => {
      const result = recursive(helper);
      assert.equal(result.reason, '');
      assert.equal(result.ok, true);
    });
  }
});

describe('entry-only helpers', () => {
  it('ensure-warm-session cannot be nested in an ordered journey', () => {
    const result = recursive('ensure/ensure-warm-session.yaml', {
      MAESTRO_FIXTURE_CHAPTER_ID: '12',
    });
    assert.equal(result.ok, false);
    assert.match(
      result.reason,
      /unclassified action flow|must remain independent/,
    );
  });

  it('non-recursive scan of .maestro/shared finds no unpinned mutating helper', () => {
    const result = preflightFromArgv({
      argv: [shared],
      cwd: root,
      fixtureEnv: {},
    });
    assert.equal(result.reason, '');
    assert.equal(result.ok, true);
  });
});
