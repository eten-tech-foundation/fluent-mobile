jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

import { Storage } from '@op-engineering/op-sqlite';
import { clearPausedTake, getPausedTake, setPausedTake } from './storage';

const mockGetItemSync = jest.mocked(Storage).mock.results[0]!.value
  .getItemSync as jest.Mock;
const mockSetItemSync = jest.mocked(Storage).mock.results[0]!.value
  .setItemSync as jest.Mock;
const mockRemoveItemSync = jest.mocked(Storage).mock.results[0]!.value
  .removeItemSync as jest.Mock;

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

  it('coerces a legacy single-fileUri marker into a one-segment list', () => {
    mockGetItemSync.mockReturnValue(
      JSON.stringify({
        bibleTextId: 42,
        fileUri: 'file:///docs/legacy-take.m4a',
        elapsedMs: 4500,
        startedAt: '2026-07-01T00:00:00.000Z',
      }),
    );

    expect(getPausedTake(42)).toEqual({
      bibleTextId: 42,
      segments: ['file:///docs/legacy-take.m4a'],
      elapsedMs: 4500,
      startedAt: '2026-07-01T00:00:00.000Z',
    });
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

  it('returns null when neither segments nor a legacy fileUri are present', () => {
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
