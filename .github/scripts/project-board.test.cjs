/**
 * Unit tests for Project 4 status option helpers.
 */

'use strict';

const {
  STATUS_OPTIONS,
  PRODUCT_OWNED_STATUSES,
  ENG_HANDOFF_FROM,
  optionIdForStatus,
} = require('./project-board.cjs');

describe('project-board STATUS_OPTIONS', () => {
  it('includes lifecycle statuses used by agents and CI', () => {
    expect(STATUS_OPTIONS['In Progress (Dev)']).toBe('db53740f');
    expect(STATUS_OPTIONS['In PR Review']).toBe('19224fda');
    expect(STATUS_OPTIONS['In QA']).toBe('bb3c3d02');
    expect(STATUS_OPTIONS.Done).toBe('3c942df6');
  });

  it('resolves option ids by name', () => {
    expect(optionIdForStatus('In QA')).toBe('bb3c3d02');
    expect(optionIdForStatus('nope')).toBeNull();
  });

  it('marks Product columns as owned', () => {
    expect(PRODUCT_OWNED_STATUSES.has('In Progress (Product)')).toBe(true);
    expect(PRODUCT_OWNED_STATUSES.has('In Progress (Dev)')).toBe(false);
  });

  it('allowlists eng handoff from In Progress / In PR Review', () => {
    expect(ENG_HANDOFF_FROM.has('In Progress (Dev)')).toBe(true);
    expect(ENG_HANDOFF_FROM.has('In PR Review')).toBe(true);
    expect(ENG_HANDOFF_FROM.has('Dev Ready')).toBe(false);
  });
});
