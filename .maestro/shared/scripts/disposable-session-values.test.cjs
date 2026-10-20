const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const script = fs.readFileSync(
  path.join(__dirname, 'disposable-session-values.js'),
  'utf8',
);
const fixture = {
  MAESTRO_DISPOSABLE_PROJECT_ID: '12',
  MAESTRO_DISPOSABLE_ASSIGNMENT_ID: '1183',
  MAESTRO_DISPOSABLE_USER_ID: '10',
  MAESTRO_DISPOSABLE_CACHED_IDS: '10,9,12',
  MAESTRO_DISPOSABLE_CONTEXT_VERIFIED: '1',
  MAESTRO_DISPOSABLE_VERSE: '2',
  MAESTRO_DISPOSABLE_PHASE: 'paused-after-reload',
  MAESTRO_DISPOSABLE_PAUSED_TIME: '0:15',
  MAESTRO_DISPOSABLE_TAKE_ID: 'rec_fixture_take',
};
function run(values) {
  const context = { output: {}, ...values };
  vm.runInNewContext(script, context);
  return context.output;
}
const flowPaths = [
  '../../flows/recording/disposable-capture-recovery-existing-session.yaml',
  '../../flows/sync/disposable-offline-upload-existing-session.yaml',
];
function docs(file) {
  const result = [];
  yaml.loadAll(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), d =>
    result.push(d),
  );
  return result;
}
test('guards fail closed for missing or wrong device context, including944 and near-match11830', () => {
  assert.throws(() => run({}));
  for (const [key, value] of [
    ['MAESTRO_DISPOSABLE_PROJECT_ID', '13'],
    ['MAESTRO_DISPOSABLE_ASSIGNMENT_ID', '944'],
    ['MAESTRO_DISPOSABLE_ASSIGNMENT_ID', '11830'],
    ['MAESTRO_DISPOSABLE_USER_ID', '12'],
    ['MAESTRO_DISPOSABLE_CACHED_IDS', '10,12'],
    ['MAESTRO_DISPOSABLE_CONTEXT_VERIFIED', '0'],
  ])
    assert.throws(() => run({ ...fixture, [key]: value }));
});
test('all supported checkpoint phases resolve exact bounded selectors; saved/uploaded require a take', () => {
  for (const phase of [
    'paused-before-reload',
    'recovery-prompt',
    'paused-after-reload',
    'background-paused',
    'saved',
    'offline-pending',
    'uploading',
    'uploaded',
  ]) {
    const output = run({ ...fixture, MAESTRO_DISPOSABLE_PHASE: phase });
    assert.equal(output.disposablePhase, phase);
    assert.equal(
      new RegExp(output.disposableReferenceRe).test('1 Peter 1:2'),
      true,
    );
    assert.equal(
      new RegExp(output.disposableReferenceRe).test('1 Peter 1:20'),
      false,
    );
    assert.equal(
      new RegExp(output.disposableTakeSyncRe).test(
        'record-take-sync-rec_fixture_takeX',
      ),
      false,
    );
  }
  for (const phase of ['saved', 'uploaded'])
    assert.throws(() =>
      run({
        ...fixture,
        MAESTRO_DISPOSABLE_PHASE: phase,
        MAESTRO_DISPOSABLE_TAKE_ID: '',
      }),
    );
  for (const pausedTime of [
    undefined,
    '',
    '0:00',
    '00:15',
    '0:60',
    '60:00',
    '0:15.*',
    ' 0:15',
    '0:1',
  ])
    assert.throws(() =>
      run({
        ...fixture,
        MAESTRO_DISPOSABLE_PHASE: 'background-paused',
        MAESTRO_DISPOSABLE_PAUSED_TIME: pausedTime,
      }),
    );
  const background = run({
    ...fixture,
    MAESTRO_DISPOSABLE_PHASE: 'background-paused',
  });
  assert.equal(background.disposablePausedTimeRe, '^0:15$');
  assert.equal(
    new RegExp(background.disposablePausedTimeRe).test('0:150'),
    false,
  );
  for (const verse of ['0', '26', '2.*', '02'])
    assert.throws(() => run({ ...fixture, MAESTRO_DISPOSABLE_VERSE: verse }));
  assert.throws(() =>
    run({ ...fixture, MAESTRO_DISPOSABLE_PHASE: 'crash-proven' }),
  );
});
test('both YAML flows parse with strict phase assertions and relative screenshots after assertions', () => {
  for (const file of flowPaths) {
    const [header, commands] = docs(file);
    assert.equal(header.appId, 'com.eten.fluent');
    assert.ok(header.tags.includes('fixture-blocked'));
    assert.ok(header.tags.includes('existing-session'));
    assert.equal(
      commands[0].runScript,
      '../../shared/scripts/disposable-session-values.js',
    );
    assert.ok(commands.some(c => c.assertTrue));
    assert.equal(
      commands.at(-1).takeScreenshot,
      '${output.disposableScreenshot}',
    );
  }
});
test('checkpoint commands cannot capture, authenticate, reset, navigate, execute shell, loop or mutate network', () => {
  const allowed = new Set([
    'runScript',
    'assertTrue',
    'assertVisible',
    'assertNotVisible',
    'runFlow',
    'takeScreenshot',
  ]);
  function inspect(commands) {
    for (const command of commands) {
      assert.equal(Object.keys(command).length, 1);
      const key = Object.keys(command)[0];
      assert.ok(allowed.has(key), key);
      if (key === 'runFlow') {
        assert.equal(typeof command.runFlow, 'object');
        assert.ok(command.runFlow.when.true);
        inspect(command.runFlow.commands);
      }
    }
  }
  for (const file of flowPaths) inspect(docs(file)[1]);
});
test('offline and recovered checkpoints retain required negative/positive control assertions', () => {
  const record = docs(flowPaths[0])[1];
  const sync = docs(flowPaths[1])[1];
  assert.match(JSON.stringify(record), /record-resume-button/);
  assert.ok(
    record
      .find(command => command.assertTrue)
      ?.assertTrue.includes('background-paused'),
  );
  const pausedControls = record.find(command =>
    command.runFlow?.when.true.includes("['paused-before-reload'"),
  );
  assert.ok(pausedControls.runFlow.when.true.includes('background-paused'));
  const backgroundTime = record.find(command =>
    command.runFlow?.when.true.includes("=== 'background-paused'"),
  );
  assert.deepEqual(backgroundTime.runFlow.commands, [
    {
      assertVisible: {
        id: 'record-duration',
        text: '${output.disposablePausedTimeRe}',
      },
    },
  ]);

  assert.match(JSON.stringify(record), /Recovered recording/);
  const prompt = record.find(command =>
    command.runFlow?.when.true.includes("=== 'recovery-prompt'"),
  ).runFlow.commands;
  assert.deepEqual(
    prompt.filter(command =>
      command.assertVisible?.id?.startsWith('android:id/'),
    ),
    [
      { assertVisible: { id: 'android:id/button1', text: '^RESUME$' } },
      { assertVisible: { id: 'android:id/button2', text: '^DISCARD$' } },
    ],
  );
  assert.match(JSON.stringify(sync), /"assertNotVisible":"Uploading"/);
  assert.match(JSON.stringify(sync), /"enabled":false/);
  assert.match(JSON.stringify(sync), /\^uploaded\$/);
});
