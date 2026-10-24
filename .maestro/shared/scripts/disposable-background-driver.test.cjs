const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const docs = [];
yaml.loadAll(
  fs.readFileSync(
    path.join(
      __dirname,
      '../../flows/recording/disposable-background-return-existing-session.yaml',
    ),
    'utf8',
  ),
  value => docs.push(value),
);
const [header, commands] = docs;
test('driver checks fixture and active Record capture before the sole HOME action', () => {
  assert.equal(header.appId, 'com.eten.fluent');
  assert.ok(header.tags.includes('fixture-blocked'));
  assert.equal(
    commands[0].runScript,
    '../../shared/scripts/disposable-session-values.js',
  );
  assert.equal(
    commands[1].assertTrue,
    "${output.disposablePhase === 'paused-before-reload'}",
  );
  const home = commands.findIndex(command => command.pressKey);
  assert.deepEqual(
    commands.filter(command => command.pressKey),
    [{ pressKey: 'HOME' }],
  );
  for (const id of [
    'record-tab',
    'record-verse-reference',
    'record-pause-button',
    'record-stop-button',
  ])
    assert.ok(
      commands.slice(0, home).some(command => command.assertVisible?.id === id),
    );
});
test('return explicitly preserves app/keychain state and disables default process stop', () => {
  assert.deepEqual(commands.find(command => command.launchApp).launchApp, {
    appId: 'com.eten.fluent',
    clearState: false,
    clearKeychain: false,
    stopApp: false,
  });
  assert.ok(
    commands.findIndex(command => command.launchApp) >
      commands.findIndex(command => command.pressKey),
  );
  const permitted = new Set([
    'runScript',
    'assertTrue',
    'assertNotVisible',
    'assertVisible',
    'pressKey',
    'launchApp',
    'copyTextFrom',
    'evalScript',
    'runFlow',
  ]);
  for (const command of commands)
    assert.ok(permitted.has(Object.keys(command)[0]));
});
test('existing exact-time paused checkpoint is last, without retry, custom route or capture actions', () => {
  assert.deepEqual(commands.at(-1), {
    runFlow: {
      file: 'disposable-capture-recovery-existing-session.yaml',
      env: {
        MAESTRO_DISPOSABLE_PHASE: 'background-paused',
        MAESTRO_DISPOSABLE_PAUSED_TIME: '${output.backgroundFrozenTime}',
      },
    },
  });
  for (const command of commands) assert.equal(Object.keys(command).length, 1);
  assert.equal(
    commands.some(
      command =>
        command.tapOn ||
        command.repeat ||
        command.openLink ||
        command.stopApp ||
        command.killApp,
    ),
    false,
  );
});
