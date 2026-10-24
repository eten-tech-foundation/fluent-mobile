const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const guard = require('../../../scripts/maestro-fixture-guard.cjs');

const script = fs.readFileSync(
  path.join(__dirname, 'c0267-ownership-visual-values.js'),
  'utf8',
);
const filename = path.join(
  __dirname,
  '../../flows/qa717-easy-ui-batch/a-user10-c0267-ownership-primary-muted-visual-existing-session.yaml',
);
const source = fs.readFileSync(filename, 'utf8');
const docs = [];
yaml.loadAll(source, x => docs.push(x));
const [header, commands] = docs;

const fixture = {
  MAESTRO_C0267_PROJECT_ID: '12',
  MAESTRO_FIXTURE_PROJECT_ID: '12',
  MAESTRO_C0267_MILESTONE_ID: '19',
  MAESTRO_FIXTURE_MILESTONE_ID: '19',
  MAESTRO_C0267_MINE_ASSIGNMENT_ID: '1185',
  MAESTRO_C0267_OTHER_ASSIGNMENT_ID: '1184',
  MAESTRO_C0267_USER_ID: '10',
  MAESTRO_C0267_CACHED_IDS: '10,9,12',
  MAESTRO_C0267_SERIAL: 'emulator-5554',
  MAESTRO_C0267_VISUAL_ATTESTATION:
    'p12-m19-1185mine-1184other-legacy-primary-muted',
};

const run = x => {
  const c = { output: {}, ...x };
  vm.runInNewContext(script, c);
  return c.output;
};

test('rejects missing attestation and wrong scope', () => {
  assert.throws(() => run({}));
  assert.throws(() =>
    run({ ...fixture, MAESTRO_C0267_MINE_ASSIGNMENT_ID: '1183' }),
  );
  assert.throws(() => run({ ...fixture, MAESTRO_C0267_SERIAL: 'emulator-5556' }));
});

test('emits Legacy primary/muted hex and row selectors', () => {
  const o = run(fixture);
  assert.equal(o.c0267VisualReady, '1');
  assert.equal(o.legacyPrimaryHex, '#0B50D0');
  assert.equal(o.legacyMutedHex, '#545454');
  assert.equal(o.mineRowIdRe, '^chapter-row-1185$');
  assert.equal(o.otherRowIdRe, '^chapter-row-1184$');
});

test('flow is ordered-readonly list-only; no drafting/capture/sync', () => {
  assert.ok(header.tags.includes('ordered-readonly'));
  assert.ok(header.tags.includes('read-only'));
  assert.ok(!header.tags.includes('mutating'));
  assert.ok(!source.includes('open-fixture-chapter-from-milestone.yaml'));
  assert.ok(!source.includes('record-start-button'));
  assert.ok(!source.includes('stage-advance'));
  assert.ok(!source.includes('home-sync'));
  assert.ok(source.includes('takeScreenshot'));
  assert.ok(source.includes('chapter-ownership-mine'));
  assert.ok(source.includes('chapter-ownership-other'));
  const taps = commands
    .filter(c => c.tapOn)
    .map(c => {
      const t = c.tapOn;
      return typeof t === 'string' ? t : t.id || t.text || JSON.stringify(t);
    });
  assert.ok(!taps.some(x => /chapter-row-118[45]/.test(String(x))));
});

test('recursive fixture guard accepts ordered-readonly list flow', () => {
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
