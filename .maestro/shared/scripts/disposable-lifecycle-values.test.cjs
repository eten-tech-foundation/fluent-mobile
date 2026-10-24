const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const guard = require('../../../scripts/maestro-fixture-guard.cjs');
const script = fs.readFileSync(
  path.join(__dirname, 'disposable-lifecycle-values.js'),
  'utf8',
);
const filename = path.join(
  __dirname,
  '../../flows/recording/disposable-recording-lifecycle-existing-session.yaml',
);
const source = fs.readFileSync(filename, 'utf8');
const docs = [];
yaml.loadAll(source, x => docs.push(x));
const [header, commands] = docs;
const fixture = {
  MAESTRO_DISPOSABLE_PROJECT_ID: '12',
  MAESTRO_DISPOSABLE_ASSIGNMENT_ID: '1183',
  MAESTRO_FIXTURE_CHAPTER_ID: '1183',
  MAESTRO_DISPOSABLE_USER_ID: '10',
  MAESTRO_DISPOSABLE_CACHED_IDS: '10,9,12',
  MAESTRO_DISPOSABLE_CONTEXT_VERIFIED: '1',
  MAESTRO_DISPOSABLE_VERSE: '6',
  MAESTRO_HOST_MIC_DISABLED_VERIFIED: '1',
  MAESTRO_DISPOSABLE_EMPTY_VERSE_VERIFIED: '1',
};
const run = x => {
  const c = { output: {}, ...x };
  vm.runInNewContext(script, c);
  return c.output;
};
test('guard rejects missing/changed scope, host microphone and empty-verse prerequisites', () => {
  assert.throws(() => run({}));
  for (const key of Object.keys(fixture)) {
    assert.throws(() => run({ ...fixture, [key]: '' }));
    assert.throws(() => run({ ...fixture, [key]: '944' }));
  }
  const o = run(fixture);
  assert.equal(o.lifecycleReferenceRe, '^1 Peter 1:6$');
  assert.ok(
    new RegExp(o.lifecycleTakeRowRe).test('record-take-row-rec_abc_def'),
  );
  assert.ok(
    !new RegExp(o.lifecycleTakeRowRe).test('Xrecord-take-row-rec_abc_def'),
  );
});
test('mutating wrapper actually calls pinned helper and passes normal static project guard', () => {
  assert.ok(header.tags.includes('mutating'));
  assert.ok(
    commands.some(
      c => c.runFlow === '../../shared/nav/open-my-work-chapter.yaml',
    ),
  );
  const base = {
    chapterId: '1183',
    projectId: '12',
    allowlist: '12',
    denylist: '944',
    flows: [{ path: filename, yaml: source }],
  };
  assert.equal(guard.evaluateChapterPreflight(base).ok, true);
  assert.equal(
    guard.evaluateChapterPreflight({ ...base, allowlist: '' }).ok,
    false,
  );
  assert.equal(
    guard.evaluateChapterPreflight({ ...base, chapterId: '' }).ok,
    false,
  );
});
test('single Start precedes HOME driver and single Save; no repeat/auth/reset/network/delete/stage action', () => {
  const taps = commands.filter(c => c.tapOn).map(c => c.tapOn.id);
  assert.equal(taps.filter(x => x === 'record-start-button').length, 1);
  assert.equal(taps.filter(x => x === 'record-stop-button').length, 1);
  const start = commands.findIndex(c => c.tapOn?.id === 'record-start-button');
  const background = commands.findIndex(
    c =>
      c.runFlow?.file === 'disposable-background-return-existing-session.yaml',
  );
  const save = commands.findIndex(c => c.tapOn?.id === 'record-stop-button');
  assert.ok(start < background && background < save);
  for (const c of commands) {
    assert.ok(!c.repeat && !c.clearState && !c.stopApp && !c.openLink);
    if (c.tapOn) assert.ok(!/delete|discard|sync|login|stage/.test(c.tapOn.id));
  }
  assert.ok(commands.some(c => c.assertNotVisible?.index === 1));
  assert.ok(
    commands.some(c => c.copyTextFrom?.id === '${output.lifecycleTakeSyncRe}'),
  );
});
