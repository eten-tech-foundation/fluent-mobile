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
  setActiveUserId,
} from './storage';

const mockGetItemSync = jest.mocked(Storage).mock.results[0]!.value
  .getItemSync as jest.Mock;
const mockSetItemSync = jest.mocked(Storage).mock.results[0]!.value
  .setItemSync as jest.Mock;
const mockRemoveItemSync = jest.mocked(Storage).mock.results[0]!.value
  .removeItemSync as jest.Mock;
const mockGetAllKeys = jest.mocked(Storage).mock.results[0]!.value
  .getAllKeys as jest.Mock;

const USER = 'user-9';

const validMarker = {
  userId: USER,
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

    expect(getPausedTake(USER, 42)).toEqual(validMarker);
    expect(mockGetItemSync).toHaveBeenCalledWith('paused_take:user-9:42');
  });

  it('returns null when bibleTextId is missing', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({
        userId: USER,
        segments: validMarker.segments,
        elapsedMs: validMarker.elapsedMs,
        startedAt: validMarker.startedAt,
      }),
    );

    expect(getPausedTake(USER, 42)).toBeNull();
  });

  it('returns null when userId mismatches', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({ ...validMarker, userId: 'other' }),
    );
    expect(getPausedTake(USER, 42)).toBeNull();
  });

  it('returns null when bibleTextId mismatches the lookup key', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({ ...validMarker, bibleTextId: 99 }),
    );

    expect(getPausedTake(USER, 42)).toBeNull();
  });

  it('returns null when segments are absent', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({
        userId: USER,
        bibleTextId: validMarker.bibleTextId,
        elapsedMs: validMarker.elapsedMs,
        startedAt: validMarker.startedAt,
      }),
    );

    expect(getPausedTake(USER, 42)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    mockGetItemSync.mockReturnValue('{not json');

    expect(getPausedTake(USER, 42)).toBeNull();
  });

  it('passes through the navigation context when present', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({
        ...validMarker,
        chapterAssignmentId: 88,
        verseNumber: 5,
      }),
    );

    expect(getPausedTake(USER, 42)).toEqual({
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
    setActiveUserId(USER);
  });

  function markerFor(bibleTextId: number, startedAt: string) {
    return {
      userId: USER,
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

  it('returns the marker for the active user only', () => {
    const markerA = markerFor(1, '2026-07-01T00:00:00.000Z');
    mockGetAllKeys.mockReturnValue([
      'userId',
      'paused_take:user-9:1',
      'paused_take:other:2',
      'last_synced_at',
    ]);
    mockGetItemSync.mockImplementation((key: string) =>
      key === 'paused_take:user-9:1' ? JSON.stringify(markerA) : 'ignored',
    );

    // Pass userId explicitly — getActiveUserId reads a separate KV mock slot.
    expect(findPausedTake(USER)).toEqual(markerA);
  });

  it('skips malformed markers for the active user', () => {
    mockGetAllKeys.mockReturnValue([
      'paused_take:user-9:oops',
      'paused_take:user-9:2',
      'paused_take:user-9:1',
    ]);
    mockGetItemSync.mockImplementation((key: string) => {
      if (key === 'paused_take:user-9:1')
        return JSON.stringify(markerFor(1, '2026-07-01T00:00:00.000Z'));
      if (key === 'paused_take:user-9:2')
        return JSON.stringify(markerFor(999, '2026-07-01T00:00:00.000Z'));
      return '{not json';
    });

    expect(findPausedTake(USER)).toEqual(
      markerFor(1, '2026-07-01T00:00:00.000Z'),
    );
  });
});

describe('setPausedTake / clearPausedTake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists the marker under a user+verse-scoped key', () => {
    setPausedTake(validMarker);

    expect(mockSetItemSync).toHaveBeenCalledWith(
      'paused_take:user-9:42',
      JSON.stringify(validMarker),
    );
  });

  it('clears the marker for the user+verse key', () => {
    clearPausedTake(USER, 42);
    expect(mockRemoveItemSync).toHaveBeenCalledWith('paused_take:user-9:42');
  });
});
