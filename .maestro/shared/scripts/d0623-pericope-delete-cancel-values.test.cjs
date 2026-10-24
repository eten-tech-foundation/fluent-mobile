const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const guard = require('../../../scripts/maestro-fixture-guard.cjs');
const script = fs.readFileSync(
  path.join(__dirname, 'd0623-pericope-delete-cancel-values.js'),
  'utf8',
);
const filename = path.join(
  __dirname,
  '../../flows/qa717-easy-ui-batch/a-user10-d0623-pericope-delete-cancel-existing-session.yaml',
);
const source = fs.readFileSync(filename, 'utf8');
const docs = [];
yaml.loadAll(source, x => docs.push(x));
const [header, commands] = docs;
const fixture = {
  MAESTRO_D0623_PROJECT_ID: '12',
  MAESTRO_D0623_ASSIGNMENT_ID: '1183',
  MAESTRO_FIXTURE_CHAPTER_ID: '1183',
  MAESTRO_D0623_USER_ID: '10',
  MAESTRO_D0623_CACHED_IDS: '10,9,12',
  MAESTRO_D0623_SERIAL: 'emulator-5554',
  MAESTRO_HOST_MIC_DISABLED_VERIFIED: '1',
  MAESTRO_D0623_APP_MIC_GRANTED_VERIFIED: '1',
  MAESTRO_D0623_EMPTY_RANGE_VERIFIED: '1',
  MAESTRO_D0623_RANGE_ATTESTATION: 'fcbh-1peter1-s3-p1-v13-16',
  MAESTRO_D0623_CONTEXT_VERIFIED: '1',
};
const run = x => {
  const c = { output: {}, ...x };
  vm.runInNewContext(script, c);
  return c.output;
};
test('guard rejects missing/changed D0623 scope and mic/range prerequisites', () => {
  assert.throws(() => run({}));
  for (const key of Object.keys(fixture)) {
    assert.throws(() => run({ ...fixture, [key]: '' }));
    assert.throws(() => run({ ...fixture, [key]: '944' }));
  }
  const o = run(fixture);
  assert.equal(o.d0623StartVerse, '13');
  assert.equal(o.d0623EndVerse, '16');
  assert.equal(o.d0623CardTextRe, '^1 Peter 1:13–16$');
  assert.ok(new RegExp(o.d0623AlertTitleRe).test('Delete pericope take?'));
  assert.ok(
    new RegExp(o.d0623AlertBodyRe).test(
      'This recording covers vv. 13-16. Deleting it will remove the whole recording from every verse in that range.',
    ),
  );
  assert.ok(new RegExp(o.d0623TakeRowRe).test('record-take-row-rec_abc_def'));
  assert.ok(
    !new RegExp(o.d0623DeleteSelectedRe).test(
      'record-delete-button-rec_abc_def',
    ),
  );
});
test('mutating wrapper passes static+recursive project12 guard via milestone helper', () => {
  assert.ok(header.tags.includes('mutating'));
  assert.ok(
    commands.some(
      c =>
        c.runFlow ===
        '../../shared/nav/open-fixture-chapter-from-milestone.yaml',
    ),
  );
  assert.ok(!source.includes('open-my-work-chapter.yaml'));
  assert.ok(!source.includes('ensure-no-modal.yaml'));
  assert.ok(!source.includes('goto-home.yaml'));
  const base = {
    chapterId: '1183',
    milestoneId: '19',
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
  const recursive = guard.preflightFromArgv({
    chapterId: '1183',
    milestoneId: '19',
    projectId: '12',
    allowlist: '12',
    denylist: '944',
    argv: ['--device', 'emulator-5554', filename],
    recursive: true,
    fixtureEnv: {
      MAESTRO_FIXTURE_PROJECT_ID: '12',
      MAESTRO_FIXTURE_CHAPTER_ID: '1183',
      MAESTRO_FIXTURE_MILESTONE_ID: '19',
    },
  });
  assert.equal(recursive.ok, true, recursive.reason);
});
test('single Start and Stop; Cancel-only delete; never confirm Delete; no auth/reset/network/stage', () => {
  const taps = commands
    .filter(c => c.tapOn)
    .map(c => {
      const t = c.tapOn;
      return typeof t === 'string' ? t : t.id || t.text || JSON.stringify(t);
    });
  assert.equal(taps.filter(x => x === 'record-start-button').length, 1);
  assert.equal(taps.filter(x => x === 'record-stop-button').length, 1);
  assert.ok(taps.some(x => String(x).includes('Cancel') || x === 'Cancel'));
  assert.ok(!taps.some(x => x === 'Delete'));
  for (const c of commands) {
    assert.ok(!c.clearState && !c.stopApp && !c.openLink);
    if (c.repeat) {
      assert.equal(c.repeat.while.visible.id, 'prepare-offline-screen');
      assert.ok(
        c.repeat.commands.every(
          x => x.tapOn?.id === 'stack-header-back' || x.waitForAnimationToEnd,
        ),
      );
    }
    if (c.tapOn && c.tapOn.id)
      assert.ok(!/discard|sync|login|stage-advance/.test(c.tapOn.id));
  }
  assert.ok(
    commands.some(
      c => c.extendedWaitUntil?.visible?.text === '${output.d0623AlertTitleRe}',
    ),
  );
});
