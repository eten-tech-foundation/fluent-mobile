const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  yaml = require('js-yaml');
const script = fs.readFileSync(
  path.join(__dirname, 'cached-ui-version-context.js'),
  'utf8',
);
const ds = [];
yaml.loadAll(
  fs.readFileSync(
    path.join(
      __dirname,
      '../../flows/edges/cached-ui-version-existing-session.yaml',
    ),
    'utf8',
  ),
  d => ds.push(d),
);
const commands = ds[1];
const context = {
  output: {},
  MAESTRO_CACHED_UI_CONTEXT_VERIFIED: '1',
  MAESTRO_CACHED_UI_INITIAL_LEGACY_VERIFIED: '1',
};
test('fail-closed root context and no inferred gallery flag', () => {
  assert.throws(() => vm.runInNewContext(script, { output: {} }));
  assert.throws(() =>
    vm.runInNewContext(script, {
      output: {},
      MAESTRO_CACHED_UI_CONTEXT_VERIFIED: '1',
    }),
  );
  vm.runInNewContext(script, context);
  assert.equal(context.output.cachedUiGalleryExpectation, 'unverified');
  assert.throws(() =>
    vm.runInNewContext(script, {
      ...context,
      MAESTRO_CACHED_UI_GALLERY_EXPECTATION: 'true',
    }),
  );
});
test('only mode mutations are Next then Legacy and every tap has bounded settle then strict assertion', () => {
  const taps = commands.filter(c => c.tapOn);
  assert.deepEqual(
    taps
      .filter(c => c.tapOn.id.startsWith('settings-ui-version-'))
      .map(c => c.tapOn.id),
    ['settings-ui-version-next', 'settings-ui-version-legacy'],
  );
  for (const c of taps) assert.equal(c.tapOn.waitToSettleTimeoutMs, 500);
  assert.equal(
    commands.filter(
      c =>
        c.assertVisible?.id === 'settings-ui-version-next' &&
        c.assertVisible.selected === true,
    ).length,
    2,
  );
  assert.ok(
    commands.some(
      c => c.extendedWaitUntil?.visible?.id === 'settings-menu-active-12',
    ),
  );
});
test('Home usable in both modes; no auth, playback, capture, gallery override or shared helpers', () => {
  for (const id of ['home-tab-projects', 'home-tab-my-work'])
    assert.equal(
      commands.filter(
        c => c.assertVisible?.id === id && c.assertVisible.selected === true,
      ).length,
      2,
    );
  for (const c of commands.filter(c => c.tapOn))
    assert.doesNotMatch(
      c.tapOn.id,
      /gallery|record-|audio|log-out|add-user|clear-cache|cellular|drafting-unit/,
    );
  assert.equal(
    commands.some(c => c.launchApp || c.clearState || c.openLink || c.pressKey),
    false,
  );
  for (const c of commands.filter(c => c.runFlow))
    assert.equal(typeof c.runFlow, 'object');
  assert.deepEqual(commands.at(-1), {
    assertNotVisible: { id: 'record-stop-button' },
  });
});
