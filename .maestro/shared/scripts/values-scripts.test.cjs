/**
 * Shared Maestro runScript value exporters — no device, no Maestro run.
 *
 * Maestro exposes `-e` / MAESTRO_* env as JS globals and collects `output.*`.
 * Each script is evaluated the same way in a fresh vm context.
 *
 * Dual-runner: Jest CI + `node --test` standalone.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runningUnderJest = typeof jest !== 'undefined';
const { describe, it } = runningUnderJest
  ? { describe: global.describe, it: global.it }
  : require('node:test');

function run(name, globals = {}, output = {}) {
  const source = fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8');
  vm.runInNewContext(source, { output, ...globals });
  return output;
}

function assertExact(re, literal) {
  assert.ok(new RegExp(re).test(literal), `${re} should match ${literal}`);
  assert.ok(!new RegExp(re).test(`x${literal}`), `${re} must be anchored`);
}

describe('resources-empty-values', () => {
  it('maps device_inventory to the exact empty copy', () => {
    const out = run('resources-empty-values', {
      MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE: '42',
      MAESTRO_EXPECT_RESOURCES_EMPTY_KIND: 'device_inventory',
    });
    assert.equal(out.emptyFixture, '42');
    assertExact(out.emptyMessageRe, out.emptyMessage);
    assert.match(out.emptyMessage, /Prepare for Offline\.$/);
  });

  it('leaves unknown or missing kinds empty', () => {
    assert.equal(run('resources-empty-values').emptyMessageRe, '');
    const out = run('resources-empty-values', {
      MAESTRO_EXPECT_RESOURCES_EMPTY_KIND: 'other',
    });
    assert.equal(out.emptyMessage, '');
  });
});

describe('resources-populated-values', () => {
  it('maps section enums to testIDs and escapes markers', () => {
    const out = run('resources-populated-values', {
      MAESTRO_EXPECT_RESOURCES_POPULATED_FIXTURE: ' 7 ',
      MAESTRO_EXPECT_RESOURCES_POPULATED_SECTION: 'images_maps',
      MAESTRO_EXPECT_RESOURCES_CONTENT_MARKER: 'Map (1).png',
    });
    assert.equal(out.sectionToggleId, 'resources-section-imagesMaps-toggle');
    assert.equal(out.sectionHostId, 'resources-section-imagesMaps');
    assertExact(out.contentMarkerRe, 'Map (1).png');
    assertExact(out.myWorkRowIdRe, 'my-work-row-7');
    assert.ok(!new RegExp(out.myWorkRowIdRe).test('my-work-row-70'));
  });

  it('exports empty selectors when env is missing', () => {
    const out = run('resources-populated-values');
    assert.equal(out.sectionId, '');
    assert.equal(out.sectionToggleId, '');
    assert.equal(out.myWorkRowIdRe, '');
  });
});

describe('sync-status-values', () => {
  it('defaults error/downloads and escapes count text', () => {
    const out = run('sync-status-values', {
      MAESTRO_EXPECT_UPLOAD_CHAPTER_COUNT_TEXT: '2 chapters (pending)',
    });
    assert.equal(out.expectSyncError, 'none');
    assert.equal(out.expectDownloads, 'absent');
    assert.equal(out.statusTitleRe, '');
    assertExact(out.countTextRe, '2 chapters (pending)');
  });
});

describe('fixture chapter row exporters', () => {
  it('take-view-values anchors the my-work row and marker', () => {
    const out = run('take-view-values', {
      MAESTRO_FIXTURE_CHAPTER_ID: '12',
      MAESTRO_FIXTURE_TAKE_VIEW_ALL_MARKER: 'All takes',
    });
    assertExact(out.myWorkRowIdRe, 'my-work-row-12');
    assert.ok(!new RegExp(out.myWorkRowIdRe).test('my-work-row-123'));
    assertExact(out.takeViewAllMarkerRe, 'All takes');
  });

  it('verse-bounds-values escapes verse references', () => {
    const out = run('verse-bounds-values', {
      MAESTRO_FIXTURE_CHAPTER_ID: '5',
      MAESTRO_FIXTURE_VERSE_REF_FIRST: 'Mark 1:1',
      MAESTRO_FIXTURE_VERSE_REF_NEXT: 'Mark 1:2-3',
    });
    assertExact(out.verseRefFirstRe, 'Mark 1:1');
    assertExact(out.verseRefNextRe, 'Mark 1:2-3');
    assertExact(out.myWorkRowIdRe, 'my-work-row-5');
  });

  it('fixture-row-values reads the normalized output.fixtureChapterId', () => {
    const out = run('fixture-row-values', {}, { fixtureChapterId: '9' });
    assertExact(out.myWorkRowIdRe, 'my-work-row-9');
    assert.ok(!new RegExp(out.myWorkRowIdRe).test('my-work-row-90'));
  });

  it('fixture-row-values exports empty when the chapter id is missing', () => {
    assert.equal(run('fixture-row-values').myWorkRowIdRe, '');
    for (const fixtureChapterId of [undefined, null, '', '  ']) {
      const out = run('fixture-row-values', {}, { fixtureChapterId });
      assert.equal(out.myWorkRowIdRe, '');
    }
  });

  it('bible-record-values builds row and reference selectors', () => {
    const out = run('bible-record-values', {
      MAESTRO_FIXTURE_CHAPTER_ID: '3',
      MAESTRO_FIXTURE_VERSE_NUMBER: '4',
      MAESTRO_EXPECT_RECORD_REFERENCE: 'Mark 1:4',
    });
    assertExact(out.myWorkRowIdRe, 'my-work-row-3');
    assertExact(out.bibleVerseRowIdRe, 'bible-verse-row-4');
    assertExact(out.recordReferenceRe, 'Mark 1:4');
    assert.ok(!new RegExp(out.myWorkRowIdRe).test('my-work-row-30'));
  });

  it('bible-record-values escapes regex metacharacters in ids', () => {
    const out = run('bible-record-values', {
      MAESTRO_FIXTURE_CHAPTER_ID: '3.1',
      MAESTRO_FIXTURE_VERSE_NUMBER: '4+',
      MAESTRO_EXPECT_RECORD_REFERENCE: '1 John 1:1 (BSB)',
    });
    assertExact(out.myWorkRowIdRe, 'my-work-row-3.1');
    assert.ok(!new RegExp(out.myWorkRowIdRe).test('my-work-row-3x1'));
    assertExact(out.bibleVerseRowIdRe, 'bible-verse-row-4+');
    assert.ok(!new RegExp(out.bibleVerseRowIdRe).test('bible-verse-row-44'));
    assertExact(out.recordReferenceRe, '1 John 1:1 (BSB)');
  });

  it('chapter-id exporters stay empty without MAESTRO_FIXTURE_CHAPTER_ID', () => {
    assert.equal(run('take-view-values').myWorkRowIdRe, '');
    assert.equal(run('verse-bounds-values').myWorkRowIdRe, '');
    const bible = run('bible-record-values');
    assert.equal(bible.myWorkRowIdRe, '');
    assert.equal(bible.bibleVerseRowIdRe, '');
    assert.equal(bible.recordReferenceRe, '');
  });
});

describe('ownership-status-values', () => {
  it('defaults record warning and escapes fixture labels', () => {
    const out = run('ownership-status-values', {
      MAESTRO_EXPECT_OWNERSHIP: 'mine',
      MAESTRO_FIXTURE_PROJECT_NAME: 'Source Audio QA — BSB',
      MAESTRO_FIXTURE_CHAPTER_LABEL: 'Mark 1',
    });
    assert.equal(out.expectOwnership, 'mine');
    assert.equal(out.expectRecordWarning, 'none');
    assertExact(out.projectNameRe, 'Source Audio QA — BSB');
    assertExact(out.chapterLabelRe, 'Mark 1');
  });
});

describe('pfo-selector-values', () => {
  it('setup phase builds project row and book selectors', () => {
    const out = run('pfo-selector-values', {
      MAESTRO_FIXTURE_PROJECT_ID: '13',
      MAESTRO_PFO_BOOK_NAME: '1 John',
    });
    assertExact(out.projectRowIdRe, 'project-row-13');
    assertExact(out.pfoBookSelectRe, 'Select all chapters in 1 John');
    assertExact(out.assignedCountLabelRe, 'Assigned chapters (4)');
  });

  it('setup phase leaves selectors empty without project id or book', () => {
    const out = run('pfo-selector-values');
    assert.equal(out.projectRowIdRe, '');
    assert.equal(out.pfoBookSelectRe, '');
  });

  it('survives repeated runs in one reused JS context', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'pfo-selector-values.js'),
      'utf8',
    );
    const context = vm.createContext({ output: {}, maestro: {} });
    context.MAESTRO_PFO_SELECTOR_PHASE = 'before';
    context.maestro.copiedText = '1.2 MB';
    vm.runInContext(source, context);
    context.MAESTRO_PFO_SELECTOR_PHASE = 'second';
    context.maestro.copiedText = '0 B';
    vm.runInContext(source, context);
    assertExact(context.output.pfoCountBeforeRe, '1.2 MB');
    assert.equal(context.output.pfoCountAfterSecond, '0 B');

    const constSource = source.replace(/^var phase/m, 'const phase');
    assert.notEqual(constSource, source);
    const constContext = vm.createContext({
      output: {},
      maestro: {},
      MAESTRO_PFO_SELECTOR_PHASE: 'second',
    });
    vm.runInContext(constSource, constContext);
    assert.throws(
      () => vm.runInContext(constSource, constContext),
      /already been declared/,
    );
  });

  it('count phases capture maestro.copiedText', () => {
    const before = run('pfo-selector-values', {
      MAESTRO_PFO_SELECTOR_PHASE: 'before',
      maestro: { copiedText: '1.2 MB' },
    });
    assertExact(before.pfoCountBeforeRe, '1.2 MB');
    const second = run('pfo-selector-values', {
      MAESTRO_PFO_SELECTOR_PHASE: 'second',
      maestro: { copiedText: '0 B' },
    });
    assert.equal(second.pfoCountAfterSecond, '0 B');
  });

  it('rejects an unknown phase', () => {
    assert.throws(
      () => run('pfo-selector-values', { MAESTRO_PFO_SELECTOR_PHASE: 'x' }),
      /Unknown PFO selector phase/,
    );
  });
});
