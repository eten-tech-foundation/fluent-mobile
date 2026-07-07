jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
    getAllKeys: jest.fn(),
  })),
}));

import { Storage } from '@op-engineering/op-sqlite';
import {
  clearPausedTake,
  findPausedTake,
  getPausedTake,
  setPausedTake,
} from './storage';

const mockGetItemSync = jest.mocked(Storage).mock.results[0]!.value
  .getItemSync as jest.Mock;
const mockSetItemSync = jest.mocked(Storage).mock.results[0]!.value
  .setItemSync as jest.Mock;
const mockRemoveItemSync = jest.mocked(Storage).mock.results[0]!.value
  .removeItemSync as jest.Mock;
const mockGetAllKeys = jest.mocked(Storage).mock.results[0]!.value
  .getAllKeys as jest.Mock;

const validMarker = {
  bibleTextId: 42,
  segments: ['file:///docs/partial-take-0.aac'],
  elapsedMs: 4500,
  startedAt: '2026-07-01T00:00:00.000Z',
};

describe('getPausedTake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemSync.mockReturnValue(null);
  });

  it('returns a valid marker for the lookup key', () => {
    mockGetItemSync.mockReturnValue(JSON.stringify(validMarker));

    expect(getPausedTake(42)).toEqual(validMarker);
    expect(mockGetItemSync).toHaveBeenCalledWith('paused_take:42');
  });

  it('returns null when bibleTextId is missing', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({
        segments: validMarker.segments,
        elapsedMs: validMarker.elapsedMs,
        startedAt: validMarker.startedAt,
      }),
    );

    expect(getPausedTake(42)).toBeNull();
  });

  it('returns null when bibleTextId is not a finite number', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({ ...validMarker, bibleTextId: '42' }),
    );
    expect(getPausedTake(42)).toBeNull();

    mockGetItemSync.mockReturnValue(
      JSON.stringify({ ...validMarker, bibleTextId: Number.NaN }),
    );
    expect(getPausedTake(42)).toBeNull();
  });

  it('returns null when bibleTextId mismatches the lookup key', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({ ...validMarker, bibleTextId: 99 }),
    );

    expect(getPausedTake(42)).toBeNull();
  });

  it('returns null when segments are absent', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({
        bibleTextId: validMarker.bibleTextId,
        elapsedMs: validMarker.elapsedMs,
        startedAt: validMarker.startedAt,
      }),
    );

    expect(getPausedTake(42)).toBeNull();
  });

  it('returns null when segments is an empty array', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({ ...validMarker, segments: [] }),
    );

    expect(getPausedTake(42)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    mockGetItemSync.mockReturnValue('{not json');

    expect(getPausedTake(42)).toBeNull();
  });

  it('passes through the navigation context when present', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({
        ...validMarker,
        chapterAssignmentId: 88,
        verseNumber: 5,
      }),
    );

    expect(getPausedTake(42)).toEqual({
      ...validMarker,
      chapterAssignmentId: 88,
      verseNumber: 5,
    });
  });
});

describe('findPausedTake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllKeys.mockReturnValue([]);
    mockGetItemSync.mockReturnValue(null);
  });

  function markerFor(bibleTextId: number, startedAt: string) {
    return {
      bibleTextId,
      segments: [`file:///docs/take-${bibleTextId}.aac`],
      elapsedMs: 1000,
      startedAt,
    };
  }

  it('returns null when no keys exist', () => {
    mockGetAllKeys.mockReturnValue([]);
    expect(findPausedTake()).toBeNull();
  });

  it('returns the marker from a paused-take key, ignoring unrelated ones', () => {
    const markerA = markerFor(1, '2026-07-01T00:00:00.000Z');
    mockGetAllKeys.mockReturnValue([
      'userId',
      'paused_take:1',
      'last_synced_at',
    ]);
    mockGetItemSync.mockImplementation((key: string) =>
      key === 'paused_take:1' ? JSON.stringify(markerA) : 'ignored',
    );

    expect(findPausedTake()).toEqual(markerA);
  });

  it('skips malformed or mismatched markers and returns the first valid one', () => {
    mockGetAllKeys.mockReturnValue([
      'paused_take:oops',
      'paused_take:2',
      'paused_take:1',
    ]);
    mockGetItemSync.mockImplementation((key: string) => {
      if (key === 'paused_take:1')
        return JSON.stringify(markerFor(1, '2026-07-01T00:00:00.000Z'));
      if (key === 'paused_take:2')
        // bibleTextId mismatches the key -> rejected
        return JSON.stringify(markerFor(999, '2026-07-01T00:00:00.000Z'));
      return '{not json';
    });

    expect(findPausedTake()).toEqual(markerFor(1, '2026-07-01T00:00:00.000Z'));
  });
});

describe('setPausedTake / clearPausedTake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists the marker under a bibleTextId-scoped key', () => {
    setPausedTake(validMarker);

    expect(mockSetItemSync).toHaveBeenCalledWith(
      'paused_take:42',
      JSON.stringify(validMarker),
    );
  });

  it('clears the marker for the given bibleTextId', () => {
    clearPausedTake(42);

    expect(mockRemoveItemSync).toHaveBeenCalledWith('paused_take:42');
  });
});
