import {
  PAUSED_TAKES_KV_KEY,
  clearPausedTake,
  isValidMarker,
  listPausedTakes,
  upsertPausedTake,
  type PausedTakeMarker,
} from './pausedTakes';
import { decideRecovery } from './pausedTakeRecovery';

const mockStore = new Map<string, string>();

jest.mock('./storage', () => ({
  kvStorage: {
    getItemSync: (key: string) => mockStore.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockStore.set(key, value);
    },
  },
}));

jest.mock('../utils/audioStorage', () => ({
  deleteFile: jest.fn().mockResolvedValue(undefined),
}));

const marker = (
  overrides: Partial<PausedTakeMarker> = {},
): PausedTakeMarker => ({
  sessionKey: '7:3',
  segments: ['file:///a.aac', 'file:///b.aac'],
  elapsedMs: 10_000,
  startedAt: '2026-10-05T10:00:00.000Z',
  chapterAssignmentId: 7,
  verseNumber: 3,
  ...overrides,
});

beforeEach(() => mockStore.clear());

describe('marker write / clear', () => {
  it('writes a marker on pause', () => {
    upsertPausedTake(marker());
    expect(listPausedTakes()).toEqual([marker()]);
  });

  it('replaces the marker for the same sessionKey instead of duplicating', () => {
    upsertPausedTake(marker({ elapsedMs: 1000 }));
    upsertPausedTake(marker({ elapsedMs: 2000 }));
    expect(listPausedTakes()).toHaveLength(1);
    expect(listPausedTakes()[0].elapsedMs).toBe(2000);
  });

  it('clears only the requested marker on stop or discard', () => {
    upsertPausedTake(marker({ sessionKey: '7:3' }));
    upsertPausedTake(marker({ sessionKey: '7:4', verseNumber: 4 }));
    clearPausedTake('7:3');
    expect(listPausedTakes().map(m => m.sessionKey)).toEqual(['7:4']);
  });
});

describe('storage hardening', () => {
  it('returns [] for corrupt JSON', () => {
    mockStore.set(PAUSED_TAKES_KV_KEY, '{not json');
    expect(listPausedTakes()).toEqual([]);
  });

  it('drops malformed entries instead of returning them', () => {
    mockStore.set(
      PAUSED_TAKES_KV_KEY,
      JSON.stringify([marker(), { sessionKey: 'x' }, null, 42]),
    );
    expect(listPausedTakes()).toEqual([marker()]);
  });

  it.each([
    ['no segments array', { ...marker(), segments: undefined }],
    ['non-string segment', { ...marker(), segments: [1] }],
    ['no sessionKey', { ...marker(), sessionKey: undefined }],
    ['non-numeric elapsedMs', { ...marker(), elapsedMs: 'x' }],
  ])('isValidMarker rejects %s', (_label, value) => {
    expect(isValidMarker(value)).toBe(false);
  });

  it('isValidMarker accepts an orphaned-but-well-formed marker', () => {
    expect(isValidMarker(marker({ verseNumber: undefined }))).toBe(true);
  });
});

describe('decideRecovery', () => {
  const files = (...uris: string[]) => new Set(uris);

  it('prompts when the verse is resolvable and segments exist', () => {
    const m = marker();
    expect(decideRecovery(m, files('file:///a.aac', 'file:///b.aac'))).toEqual({
      kind: 'prompt',
      marker: m,
    });
  });

  it('prompts with only the surviving segments when some are missing', () => {
    const result = decideRecovery(marker(), files('file:///a.aac'));
    expect(result).toEqual({
      kind: 'prompt',
      marker: marker({ segments: ['file:///a.aac'] }),
    });
  });

  it('cleans up when no segment files survive', () => {
    expect(decideRecovery(marker(), files())).toEqual({
      kind: 'cleanup',
      marker: marker(),
      reason: 'no-segments',
    });
  });

  it.each([
    ['verseNumber', { verseNumber: undefined }],
    ['chapterAssignmentId', { chapterAssignmentId: undefined }],
  ])('cleans up as orphaned when %s is missing', (_label, overrides) => {
    const m = marker(overrides);
    expect(decideRecovery(m, files('file:///a.aac', 'file:///b.aac'))).toEqual({
      kind: 'cleanup',
      marker: m,
      reason: 'orphaned',
    });
  });

  it('prefers orphaned over no-segments when both apply', () => {
    const m = marker({ verseNumber: undefined });
    expect(decideRecovery(m, files())).toMatchObject({ reason: 'orphaned' });
  });

  it('does not mutate the input marker', () => {
    const m = marker();
    decideRecovery(m, files('file:///a.aac'));
    expect(m.segments).toEqual(['file:///a.aac', 'file:///b.aac']);
  });
});
