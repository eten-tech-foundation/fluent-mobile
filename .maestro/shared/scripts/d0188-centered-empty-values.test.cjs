const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const oracle = require('./d0188-geometry-oracle.cjs');

const script = fs.readFileSync(
  path.join(__dirname, 'd0188-centered-empty-values.js'),
  'utf8',
);
const filename = path.join(
  __dirname,
  '../../flows/qa717-easy-ui-batch/a-user10-d0188-centered-empty-geometry-existing-session.yaml',
);
const source = fs.readFileSync(filename, 'utf8');
const docs = [];
yaml.loadAll(source, x => docs.push(x));
const [header, commands] = docs;

const fixture = {
  MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE: '484',
  MAESTRO_EXPECT_RESOURCES_EMPTY_KIND: 'none_for_verse',
  MAESTRO_D0188_USER_ID: '10',
  MAESTRO_D0188_CACHED_IDS: '10,9,12',
  MAESTRO_D0188_SERIAL: 'emulator-5554',
  MAESTRO_D0188_GEOMETRY_ATTESTATION: '1',
  MAESTRO_D0188_ONLINE_EMPTY_PRECONDITION_VERIFIED: '1',
  MAESTRO_D0188_AIRPLANE_OFF_VERIFIED: '1',
};

const run = x => {
  const c = { output: {}, ...x };
  vm.runInNewContext(script, c);
  return c.output;
};

test('rejects missing precondition / wrong fixture / B serial', () => {
  assert.throws(() => run({}));
  assert.throws(() =>
    run({ ...fixture, MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE: '1183' }),
  );
  assert.throws(() =>
    run({ ...fixture, MAESTRO_EXPECT_RESOURCES_EMPTY_KIND: 'device_inventory' }),
  );
  assert.throws(() =>
    run({ ...fixture, MAESTRO_D0188_SERIAL: 'emulator-5556' }),
  );
  assert.throws(() =>
    run({
      ...fixture,
      MAESTRO_D0188_ONLINE_EMPTY_PRECONDITION_VERIFIED: '0',
    }),
  );
});

test('emits none_for_verse copy, host/message ids, restore12', () => {
  const o = run(fixture);
  assert.equal(o.d0188GeometryReady, '1');
  assert.equal(o.emptyFixture, '484');
  assert.equal(o.emptyKind, 'none_for_verse');
  assert.equal(o.emptyMessage, 'No resources available for this verse');
  assert.equal(o.emptyHostId, 'resources-tab');
  assert.equal(o.emptyMessageId, 'resources-tab-empty-message');
  assert.equal(o.myWorkRowId, 'my-work-row-484');
  assert.equal(o.restoreActiveUserId, '12');
  assert.equal(o.geometryMaxDeltaCenterXFrac, '0.08');
  assert.equal(o.geometryMaxDeltaCenterYFrac, '0.08');
});

test('flow is read-only fixture484 geometry; restores active12; no capture/sync', () => {
  assert.ok(header.tags.includes('read-only'));
  assert.ok(header.tags.includes('d0188-geometry'));
  assert.ok(!header.tags.includes('mutating'));
  assert.ok(!source.includes('open-fixture-chapter-from-milestone.yaml'));
  assert.ok(!source.includes('record-start-button'));
  assert.ok(!source.includes('home-sync'));
  assert.ok(!commands.some(c => Object.prototype.hasOwnProperty.call(c, 'clearState')));
  assert.ok(source.includes('resources-tab-empty-message'));
  assert.ok(source.includes('my-work-row-484'));
  assert.ok(source.includes('takeScreenshot'));
  assert.ok(source.includes('settings-menu-account-12'));
  const taps = commands
    .filter(c => c.tapOn)
    .map(c => {
      const t = c.tapOn;
      return typeof t === 'string' ? t : t.id || t.text || JSON.stringify(t);
    });
  assert.ok(taps.includes('my-work-row-484'));
  assert.ok(taps.includes('drafting-tab-resources'));
  assert.ok(taps.includes('settings-menu-account-12'));
});

test('geometry oracle accepts centered message; rejects offset', () => {
  const host = { x: 0, y: 200, width: 1080, height: 1600 };
  const centered = { x: 140, y: 900, width: 800, height: 80 };
  const ok = oracle.evaluateCentered(host, centered, 0.08, 0.08);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const offset = { x: 800, y: 200, width: 200, height: 80 };
  const bad = oracle.evaluateCentered(host, offset, 0.08, 0.08);
  assert.equal(bad.ok, false);
});

test('geometry oracle matches T7 supplemental deltas within 0.08', () => {
  // T7 png_gray_centroid reported dx=0.062 dy=0.0433 centered=true on 1080x2400.
  const host = { x: 0, y: 0, width: 1080, height: 2400 };
  const msg = {
    x: 1080 * (0.5 - 0.062) - 200,
    y: 2400 * (0.5 - 0.0433) - 40,
    width: 400,
    height: 80,
  };
  // Align message center to reported deltas from host center.
  const hc = oracle.centerOf(host);
  msg.x = hc.cx - 0.062 * host.width - msg.width / 2;
  msg.y = hc.cy - 0.0433 * host.height - msg.height / 2;
  const r = oracle.evaluateCentered(host, msg, 0.08, 0.08);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(Math.abs(r.deltaCenterXFrac - 0.062) < 1e-9);
  assert.ok(Math.abs(r.deltaCenterYFrac - 0.0433) < 1e-9);
});

test('hierarchy walk finds resource-id bounds', () => {
  const hierarchy = {
    hierarchy: {
      attributes: { 'resource-id': 'android:id/content', bounds: '[0,0][1080,2400]' },
      children: [
        {
          attributes: {
            'resource-id': 'com.eten.fluent:id/resources-tab',
            bounds: '[0,200][1080,1800]',
          },
          children: [
            {
              attributes: {
                'resource-id': 'com.eten.fluent:id/resources-tab-empty-message',
                bounds: '[140,920][940,1000]',
              },
            },
          ],
        },
      ],
    },
  };
  const r = oracle.evaluateFromHierarchy(hierarchy, {
    maxDxFrac: 0.08,
    maxDyFrac: 0.08,
  });
  assert.equal(r.ok, true, JSON.stringify(r));
});
