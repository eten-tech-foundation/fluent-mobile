const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');
const oracle = JSON.parse(
  fs.readFileSync(
    path.join(root, 'fixtures/cached-granularity-1183.json'),
    'utf8',
  ),
);
const script = fs.readFileSync(
  path.join(__dirname, 'cached-granularity-context.js'),
  'utf8',
);
const docs = [];
yaml.loadAll(
  fs.readFileSync(
    path.join(
      root,
      'flows/edges/cached-granularity-content-existing-session.yaml',
    ),
    'utf8',
  ),
  d => docs.push(d),
);
const topLevelCommands = docs[1];
const commands = topLevelCommands.flatMap(c => c.runFlow?.commands || [c]);
test('root independent context guard fails closed and retains exact fixture oracle', () => {
  assert.throws(() => vm.runInNewContext(script, { output: {} }));
  assert.throws(() =>
    vm.runInNewContext(script, {
      output: {},
      MAESTRO_CACHED_UNIT_CONTEXT_VERIFIED: '0',
    }),
  );
  const output = {};
  vm.runInNewContext(script, {
    output,
    MAESTRO_CACHED_UNIT_CONTEXT_VERIFIED: '1',
    MAESTRO_CACHED_UNIT_PHASE: 'full',
  });
  assert.equal(output.cachedUnitFixture, '12:1183:10:1:178:60');
  assert.deepEqual(oracle.first.verses, [1, 2]);
  assert.deepEqual(oracle.next.verses, [3, 4, 5]);
  assert.equal(oracle.sourceTextOracle.length, 9);
  assert.equal(oracle.totalPericopes, 9);
  assert.throws(() =>
    vm.runInNewContext(script, {
      output: {},
      MAESTRO_CACHED_UNIT_CONTEXT_VERIFIED: '1',
    }),
  );
  assert.throws(() =>
    vm.runInNewContext(script, {
      output: {},
      MAESTRO_CACHED_UNIT_CONTEXT_VERIFIED: '1',
      MAESTRO_CACHED_UNIT_PHASE: 'prepared-content',
    }),
  );
  const prepared = {
    output: {},
    MAESTRO_CACHED_UNIT_CONTEXT_VERIFIED: '1',
    MAESTRO_CACHED_UNIT_PHASE: 'prepared-content',
    MAESTRO_CACHED_UNIT_PREPARED_PERICOPE_VERIFIED: '1',
  };
  vm.runInNewContext(script, prepared);
  assert.equal(prepared.output.cachedUnitPhase, 'prepared-content');
  const setup = topLevelCommands.find(c => c.runFlow).runFlow;
  assert.equal(setup.when.true, "${output.cachedUnitPhase === 'full'}");
  assert.ok(
    setup.commands.some(c => c.tapOn?.id === 'settings-drafting-unit-pericope'),
  );
  for (const id of [
    '^bible-pericope-verse-1-1$',
    '^bible-pericope-verse-1-2$',
  ]) {
    const marker = topLevelCommands.find(c => c.assertVisible?.id === id);
    assert.deepEqual(marker.assertVisible.childOf, { id: 'bible-tab' });
  }
});
test('mode changes restore Verse and next/previous assert exact independently known ranges/captions', () => {
  const modeTaps = commands
    .filter(c => c.tapOn?.id?.startsWith('settings-drafting-unit-'))
    .map(c => c.tapOn.id);
  assert.deepEqual(modeTaps, [
    'settings-drafting-unit-pericope',
    'settings-drafting-unit-verse',
  ]);
  const refs = commands
    .filter(c => c.assertVisible?.id === 'record-verse-reference')
    .map(c => c.assertVisible.text);
  assert.deepEqual(refs, [
    '^1 Peter 1:1–2$',
    '^1 Peter 1:3–5$',
    '^1 Peter 1:1–2$',
    '^1 Peter 1:6$',
  ]);
  const assignmentScrolls = commands.filter(
    c => c.scrollUntilVisible?.element?.id === '^my-work-row-1183$',
  );
  assert.equal(assignmentScrolls.length, 2);
  for (const command of assignmentScrolls)
    assert.deepEqual(command.scrollUntilVisible, {
      element: { id: '^my-work-row-1183$' },
      direction: 'DOWN',
      timeout: 30000,
      speed: 70,
      centerElement: true,
    });
  const verseScroll = commands.findIndex(
    c => c.scrollUntilVisible?.element?.id === '^bible-verse-row-6$',
  );
  assert.ok(
    verseScroll >= 0 &&
      verseScroll <
        commands.findIndex(c => c.tapOn?.id === '^bible-verse-row-6$'),
  );
  assert.equal(
    commands.filter(c => c.tapOn?.id === 'record-next-verse').length,
    1,
  );
  assert.equal(
    commands.filter(c => c.tapOn?.id === 'record-prev-verse').length,
    1,
  );
  assert.ok(
    JSON.stringify(commands).includes('^WEB Source Audio · Verse 6 / 25$'),
  );
});
test('flow cannot play/capture, change auth/cellular/UIversion or invoke unsafe helpers', () => {
  const ids = commands
    .filter(c => c.tapOn)
    .map(c => c.tapOn.id || c.tapOn.text);
  for (const id of ids)
    assert.doesNotMatch(
      id,
      /record-(start|new-take|stop|pause|resume)|source-audio-play|delete|stage-advance|login|log-out|add-user|upload-cellular|ui-version/,
    );
  assert.equal(
    commands.some(c => c.launchApp || c.clearState || c.openLink || c.pressKey),
    false,
  );
  assert.ok(docs[0].tags.includes('fixture-blocked'));
  assert.deepEqual(commands.at(-1), {
    assertVisible: { id: 'home-tab-my-work' },
  });
});
