/**
 * D-0702 hydration-branch classifier — available / unavailable / loading / mixed.
 * Dual-runner: Jest CI + `node --test`.
 *
 * STATIC / MODEL ONLY: documents terminal semantics for authoring tests.
 * Does NOT validate Maestro runtime `${...}` predicates — those are gated by
 * scripts/qa717-easy-ui-batch/d0702-graal-gate.py under installed Graal jars.
 */
'use strict';

const assert = require('node:assert/strict');
const {
  UNAVAILABLE_MESSAGE,
  classifyHydrationTerminal,
  POSITIVE_SIZE_RE,
  POSITIVE_DOWNLOAD_RE,
} = require('./d0702-hydration-branch.cjs');

const runningUnderJest = typeof jest !== 'undefined';
const harness = runningUnderJest
  ? { describe: global.describe, it: global.it }
  : require('node:test');
const { describe, it } = harness;

/** Signals matching retained step-066 available hierarchy (rounded labels). */
const AVAILABLE_MATTHEW = {
  loadingVisible: false,
  unavailableVisible: false,
  resourcesSectionVisible: true,
  footerHintVisible: false,
  downloadEnabled: true,
  totalBytesText: '2.4 MB',
  downloadLabel: 'Download 2.4 MB',
};

/** Signals matching historical unavailable explanation branch. */
const UNAVAILABLE = {
  loadingVisible: false,
  unavailableVisible: true,
  resourcesSectionVisible: false,
  footerHintVisible: true,
  downloadEnabled: false,
  totalBytesText: '0 B',
  downloadLabel: 'Download 0 B',
};

describe('D-0702 hydration branch classifier', () => {
  it('accepts retained available Matthew hydration (positive rounded sizes)', () => {
    const r = classifyHydrationTerminal(AVAILABLE_MATTHEW);
    assert.equal(r.ok, true);
    assert.equal(r.branch, 'available');
    assert.ok(POSITIVE_SIZE_RE.test('2.4 MB'));
    assert.ok(POSITIVE_SIZE_RE.test('1.7 MB'));
    assert.ok(POSITIVE_SIZE_RE.test('70 KB'));
    assert.ok(POSITIVE_DOWNLOAD_RE.test('Download 2.4 MB'));
    // Do not require row-sum == total (rounded semantics).
    assert.notEqual('1.7 MB', '2.4 MB');
  });

  it('accepts exact unavailable explanation terminal', () => {
    const r = classifyHydrationTerminal(UNAVAILABLE);
    assert.equal(r.ok, true);
    assert.equal(r.branch, 'unavailable');
    assert.equal(UNAVAILABLE_MESSAGE.includes('Couldn'), true);
  });

  it('rejects loading / disabled-transient (not a PASS)', () => {
    assert.equal(
      classifyHydrationTerminal({
        ...UNAVAILABLE,
        loadingVisible: true,
        unavailableVisible: false,
        footerHintVisible: true,
      }).ok,
      false,
    );
    assert.equal(
      classifyHydrationTerminal({
        loadingVisible: false,
        unavailableVisible: false,
        resourcesSectionVisible: false,
        footerHintVisible: true,
        downloadEnabled: false,
        totalBytesText: '0 B',
        downloadLabel: 'Download 0 B',
      }).reason,
      'disabled-transient-not-terminal',
    );
  });

  it('rejects mixed / invalid terminals', () => {
    assert.equal(
      classifyHydrationTerminal({
        ...AVAILABLE_MATTHEW,
        unavailableVisible: true,
      }).reason,
      'mixed-available-and-unavailable',
    );
    assert.equal(
      classifyHydrationTerminal({
        ...UNAVAILABLE,
        downloadEnabled: true,
      }).reason,
      'unavailable-but-download-enabled',
    );
    assert.equal(
      classifyHydrationTerminal({
        ...AVAILABLE_MATTHEW,
        downloadEnabled: false,
      }).reason,
      'available-but-download-disabled',
    );
    assert.equal(
      classifyHydrationTerminal({
        ...AVAILABLE_MATTHEW,
        totalBytesText: '0 B',
      }).reason,
      'available-nonpositive-total',
    );
    assert.equal(
      classifyHydrationTerminal({
        ...AVAILABLE_MATTHEW,
        downloadLabel: 'Download 0 B',
      }).reason,
      'available-nonpositive-download-label',
    );
    assert.equal(
      classifyHydrationTerminal({
        ...AVAILABLE_MATTHEW,
        footerHintVisible: true,
      }).reason,
      'available-with-footer-hint',
    );
    assert.equal(
      classifyHydrationTerminal({
        ...UNAVAILABLE,
        resourcesSectionVisible: false,
        totalBytesText: '2.4 MB',
      }).reason,
      'unavailable-nonzero-total',
    );
  });

  it('rejects bare Download label and zero-only positive matchers', () => {
    assert.ok(!POSITIVE_DOWNLOAD_RE.test('Download'));
    assert.ok(!POSITIVE_DOWNLOAD_RE.test('Download 0 B'));
    assert.ok(!POSITIVE_SIZE_RE.test('0 B'));
    assert.ok(POSITIVE_SIZE_RE.test('1 B'));
  });
});
