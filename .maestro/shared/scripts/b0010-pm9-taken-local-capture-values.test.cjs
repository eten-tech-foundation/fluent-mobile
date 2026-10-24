const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const guard = require('../../../scripts/maestro-fixture-guard.cjs');

const script = fs.readFileSync(
  path.join(__dirname, 'b0010-pm9-taken-local-capture-values.js'),
  'utf8',
);
const filename = path.join(
  __dirname,
  '../../flows/qa717-easy-ui-batch/a-user9-b0010-taken-local-capture-1185-existing-session.yaml',
);
const source = fs.readFileSync(filename, 'utf8');
const docs = [];
yaml.loadAll(source, x => docs.push(x));
const [header, commands] = docs;

const fixture = {
  MAESTRO_B0010_PROJECT_ID: '12',
  MAESTRO_FIXTURE_PROJECT_ID: '12',
  MAESTRO_B0010_MILESTONE_ID: '19',
  MAESTRO_FIXTURE_MILESTONE_ID: '19',
  MAESTRO_B0010_ASSIGNMENT_ID: '1185',
  MAESTRO_FIXTURE_CHAPTER_ID: '1185',
  MAESTRO_B0010_USER_ID: '9',
  MAESTRO_B0010_CACHED_IDS: '10,9,12',
  MAESTRO_B0010_SERIAL: 'emulator-5554',
  MAESTRO_HOST_MIC_DISABLED_VERIFIED: '1',
  MAESTRO_B0010_VERSE: '1',
  MAESTRO_B0010_EMPTY_VERSE_VERIFIED: '1',
  MAESTRO_B0010_ADMISSION: 'ADMITTED',
};

const run = x => {
  const c = { output: {}, ...x };
  vm.runInNewContext(script, c);
  return c.output;
};

test('rejects missing admission / wrong assignment / B serial', () => {
  assert.throws(() => run({}));
  assert.throws(() =>
    run({ ...fixture, MAESTRO_B0010_ASSIGNMENT_ID: '1183' }),
  );
  assert.throws(() =>
    run({
      ...fixture,
      MAESTRO_B0010_ASSIGNMENT_ID: '1184',
      MAESTRO_FIXTURE_CHAPTER_ID: '1184',
    }),
  );
  assert.throws(() =>
    run({ ...fixture, MAESTRO_B0010_SERIAL: 'emulator-5556' }),
  );
  assert.throws(() =>
    run({ ...fixture, MAESTRO_B0010_ADMISSION: 'NOT_ADMITTED' }),
  );
});

test('emits 1185 verse1 selectors and restore12', () => {
  const o = run(fixture);
  assert.equal(o.b0010Ready, '1');
  assert.equal(o.chapterRowIdRe, '^chapter-row-1185$');
  assert.equal(o.verseRowIdRe, '^bible-verse-row-1$');
  assert.equal(o.referenceRe, '^1 Peter 3:1$');
  assert.equal(o.restoreActiveUserId, '12');
});

test('flow captures once then restores 12; no delete/stage/sync force', () => {
  assert.ok(header.tags.includes('mutating'));
  assert.ok(header.tags.includes('b0010'));
  assert.ok(source.includes('record-taken-warning'));
  assert.ok(source.includes('record-start-button'));
  assert.ok(source.includes('record-stop-button'));
  assert.ok(source.includes('settings-menu-account-9'));
  assert.ok(source.includes('settings-menu-account-12'));
  assert.ok(!source.includes('record-delete'));
  assert.ok(!source.includes('stage-advance'));
  assert.ok(!source.includes('home-sync'));
  assert.ok(!source.includes('clearState'));
  const startTaps = commands.filter(
    c => c.tapOn && (c.tapOn.id === 'record-start-button' || c.tapOn === 'record-start-button'),
  );
  assert.equal(startTaps.length, 1);
});

test('recursive fixture guard accepts project12/1185', () => {
  const recursive = guard.preflightFromArgv({
    chapterId: '1185',
    milestoneId: '19',
    projectId: '12',
    allowlist: '12',
    denylist: '944',
    argv: ['--device', 'emulator-5554', filename],
    recursive: true,
    fixtureEnv: {
      MAESTRO_FIXTURE_PROJECT_ID: '12',
      MAESTRO_FIXTURE_CHAPTER_ID: '1185',
      MAESTRO_FIXTURE_MILESTONE_ID: '19',
    },
  });
  assert.equal(recursive.ok, true, recursive.reason);
});
