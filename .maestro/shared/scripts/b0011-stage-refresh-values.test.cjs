const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const guard = require('../../../scripts/maestro-fixture-guard.cjs');

const script = fs.readFileSync(
  path.join(__dirname, 'b0011-stage-refresh-values.js'),
  'utf8',
);
const filename = path.join(
  __dirname,
  '../../flows/qa717-easy-ui-batch/a-user10-b0011-stage-refresh-chapter-list-existing-session.yaml',
);
const source = fs.readFileSync(filename, 'utf8');
const docs = [];
yaml.loadAll(source, x => docs.push(x));
const [header, commands] = docs;

// Harness-only admitted envelope — NOT live QA admission.
const admittedHarness = {
  MAESTRO_B0011_PROJECT_ID: '12',
  MAESTRO_B0011_MILESTONE_ID: '19',
  MAESTRO_B0011_ASSIGNMENT_ID: '1185',
  MAESTRO_FIXTURE_CHAPTER_ID: '1185',
  MAESTRO_FIXTURE_MILESTONE_ID: '19',
  MAESTRO_FIXTURE_PROJECT_ID: '12',
  MAESTRO_B0011_USER_ID: '10',
  MAESTRO_B0011_CACHED_IDS: '10,9,12',
  MAESTRO_B0011_SERIAL: 'emulator-5554',
  MAESTRO_B0011_PHASE: 'after',
  MAESTRO_B0011_EXPECT_OWNERSHIP: 'mine',
  MAESTRO_B0011_EXPECT_STAGE_LABEL: 'Draft',
  MAESTRO_B0011_CHAPTER_LABEL: '1 Peter 3',
  MAESTRO_B0011_ADMISSION: 'ADMITTED',
  MAESTRO_B0011_OWNERSHIP_PREFLIGHT_VERIFIED: '1',
  MAESTRO_B0011_EMPTY_RECORDINGS_VERIFIED: '1',
  MAESTRO_B0011_LIVE_MUTATION_HOLD: 'approved-at-execution',
  MAESTRO_B0011_WEB_RECEIPT_ID: 'web-after-harness-only',
};

const run = x => {
  const c = { output: {}, ...x };
  vm.runInNewContext(script, c);
  return c.output;
};

test('rejects missing env and NOT_ADMITTED default', () => {
  assert.throws(() => run({}), /NOT_ADMITTED|Requires/);
  assert.throws(
    () => run({ ...admittedHarness, MAESTRO_B0011_ADMISSION: '' }),
    /NOT_ADMITTED/,
  );
  assert.throws(
    () =>
      run({
        ...admittedHarness,
        MAESTRO_B0011_ADMISSION: 'NOT_ADMITTED',
      }),
    /NOT_ADMITTED/,
  );
});

test('rejects protected 1183/1184/944 even if marked ADMITTED', () => {
  for (const id of ['1183', '1184', '944']) {
    assert.throws(
      () =>
        run({
          ...admittedHarness,
          MAESTRO_B0011_ASSIGNMENT_ID: id,
          MAESTRO_FIXTURE_CHAPTER_ID: id,
        }),
      /Protected|denylisted|forbidden/,
    );
  }
});

test('rejects bad phase/ownership/stage and mismatched fixture chapter', () => {
  assert.throws(
    () => run({ ...admittedHarness, MAESTRO_B0011_PHASE: 'mid' }),
    /PHASE/,
  );
  assert.throws(
    () =>
      run({
        ...admittedHarness,
        MAESTRO_B0011_EXPECT_OWNERSHIP: 'owned',
      }),
    /OWNERSHIP/,
  );
  assert.throws(
    () =>
      run({
        ...admittedHarness,
        MAESTRO_B0011_EXPECT_STAGE_LABEL: 'PeerChecking',
      }),
    /STAGE_LABEL/,
  );
  assert.throws(
    () =>
      run({
        ...admittedHarness,
        MAESTRO_FIXTURE_CHAPTER_ID: '1186',
      }),
    /equal MAESTRO_B0011_ASSIGNMENT_ID/,
  );
});

test('admitted harness emits selector oracles from source labels', () => {
  const o = run(admittedHarness);
  assert.equal(o.b0011Admitted, '1');
  assert.equal(o.b0011Phase, 'after');
  assert.equal(o.b0011AssignmentId, '1185');
  assert.equal(o.expectOwnership, 'mine');
  assert.equal(o.chapterLabelRe, '^1 Peter 3$');
  assert.equal(o.stageLabelRe, '^Draft$');
  assert.equal(o.chapterRowIdRe, '^chapter-row-1185$');
  assert.equal(o.milestoneRowIdRe, '^milestone-row-19$');
  assert.equal(o.webReceiptId, 'web-after-harness-only');
  const before = run({
    ...admittedHarness,
    MAESTRO_B0011_PHASE: 'before',
    MAESTRO_B0011_EXPECT_OWNERSHIP: 'unassigned',
    MAESTRO_B0011_EXPECT_STAGE_LABEL: 'Not Started',
    MAESTRO_B0011_WEB_RECEIPT_ID: 'web-before-harness-only',
  });
  assert.equal(before.b0011Phase, 'before');
  assert.equal(before.expectOwnership, 'unassigned');
  assert.equal(before.stageLabelRe, '^Not Started$');
});

test('flow is read-only list assertion; no drafting helper / capture / stage', () => {
  assert.ok(header.tags.includes('read-only'));
  assert.ok(header.tags.includes('ordered-readonly'));
  assert.ok(header.tags.includes('fixture-blocked'));
  assert.ok(!header.tags.includes('mutating'));
  assert.ok(!source.includes('open-fixture-chapter-from-milestone.yaml'));
  assert.ok(!source.includes('open-my-work-chapter.yaml'));
  assert.ok(!source.includes('record-start-button'));
  assert.ok(!source.includes('stage-advance'));
  assert.ok(!source.includes('clearState'));
  assert.ok(source.includes('b0011-stage-refresh-values.js'));
  assert.ok(source.includes('chapter-ownership-mine'));
  assert.ok(source.includes('${output.stageLabelRe}'));
  const taps = commands
    .filter(c => c.tapOn)
    .map(c => {
      const t = c.tapOn;
      return typeof t === 'string' ? t : t.id || t.text || JSON.stringify(t);
    });
  assert.ok(taps.includes('home-tab-projects'));
  assert.ok(taps.includes('${output.milestoneRowIdRe}'));
  assert.ok(!taps.some(x => /record-start|stage-advance|login/.test(String(x))));
});

test('recursive fixture guard: read-only flow needs no chapter pin helper', () => {
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
  // Mutating without pin helper is blocked by the same guard.
  const mutatingYaml = source.replace(
    '  - read-only\n',
    '  - read-only\n  - mutating\n',
  );
  const mutatingEval = guard.evaluateChapterPreflight({
    chapterId: '1185',
    milestoneId: '19',
    projectId: '12',
    allowlist: '12',
    denylist: '944',
    flows: [{ path: filename, yaml: mutatingYaml }],
  });
  assert.equal(mutatingEval.ok, false);
  assert.match(mutatingEval.reason, /mutating flow does not target/);
});
