import { getChapterAssignmentById, getChapterRouteNames } from '../db/queries';
import type { PausedTakeMarker } from '../services/pausedTakes';
import { hrefs } from './hrefs';
import { resolveRecoveryHref } from './recoveryHref';

// Only these two reads exist: a call to anything else, such as a pericope
// lookup or the drafting setting, would throw here.
jest.mock('../db/queries', () => ({
  getChapterAssignmentById: jest.fn(),
  getChapterRouteNames: jest.fn(),
}));

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockNames = getChapterRouteNames as jest.Mock;

/** Serialized as markers are stored, including ones from before captures. */
const fixtures: Record<string, PausedTakeMarker> = {
  'a verse take': {
    sessionKey: '5:23',
    segments: ['file:///a.aac'],
    elapsedMs: 4000,
    startedAt: '2026-11-01T10:00:00Z',
    chapterAssignmentId: 5,
    verseNumber: 23,
    capture: {
      bibleTextId: 43,
      granularity: 'verse',
      startChapter: 14,
      startVerse: 23,
      endChapter: 14,
      endVerse: 23,
    },
  },
  'a passage take paused after the passage start': {
    sessionKey: '5:23',
    segments: ['file:///a.aac'],
    elapsedMs: 4000,
    startedAt: '2026-11-01T10:00:00Z',
    chapterAssignmentId: 5,
    verseNumber: 23,
    capture: {
      bibleTextId: 42,
      granularity: 'pericope',
      startChapter: 14,
      startVerse: 22,
      endChapter: 14,
      endVerse: 25,
    },
  },
  'a marker from before captures': JSON.parse(
    '{"sessionKey":"5:23","segments":["file:///a.aac"],"elapsedMs":4000,' +
      '"startedAt":"2026-08-01T10:00:00Z","chapterAssignmentId":5,"verseNumber":23}',
  ),
};

const names = {
  projectName: 'Mark Telugu',
  milestoneName: 'Gospels Phase 1',
  language: 'Telugu',
};

const nextHref = (overrides: Partial<Parameters<typeof hrefs.passage>[0]>) =>
  hrefs.passage({
    chapterId: 5,
    anchorVerse: 23,
    projectId: 9,
    projectUnitId: 3,
    chapterName: 'Mark 14',
    ...names,
    verse: 23,
    recover: { sessionKey: '5:23', verse: 23 },
    ...overrides,
  });

describe('resolveRecoveryHref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      projectUnitId: 3,
      bookId: 41,
      bookName: 'Mark',
      chapterNumber: 14,
    });
    mockNames.mockResolvedValue(names);
  });

  describe.each(Object.entries(fixtures))('%s', (_name, marker) => {
    it('opens its passage with the saved key and verse, not the passage start', async () => {
      const result = await resolveRecoveryHref(marker);

      expect(result).toEqual({ status: 'open', href: nextHref({}) });
      if (result.status !== 'open') return;
      expect(result.href.pathname).toBe('/(app)/(stack)/passage');
      expect(result.href.pathname).not.toBe('/(app)/(stack)/verse-detail');
      expect(result.href.params).toMatchObject({
        recoverSessionKey: '5:23',
        recoverVerse: '23',
        anchorVerse: '23',
      });
    });

    it("leaves the marker as it's stored", async () => {
      const before = JSON.parse(JSON.stringify(marker));
      await resolveRecoveryHref(marker);
      expect(marker).toEqual(before);
    });
  });

  it('opens the passage for a marker that used to open classic drafting', async () => {
    const result = await resolveRecoveryHref(fixtures['a verse take']);
    expect(result).toEqual({ status: 'open', href: nextHref({}) });
    expect(mockNames).toHaveBeenCalledTimes(1);
  });

  it("is unread while the chapter's names can't be read, and opens the same session once they can", async () => {
    const marker = fixtures['a passage take paused after the passage start'];
    mockNames.mockResolvedValueOnce(null);

    await expect(resolveRecoveryHref(marker)).resolves.toEqual({
      status: 'unread',
    });
    await expect(resolveRecoveryHref(marker)).resolves.toEqual({
      status: 'open',
      href: nextHref({}),
    });
  });

  it('opens with blank labels when the project rows have none', async () => {
    mockNames.mockResolvedValue({
      projectName: '',
      milestoneName: '',
      language: '',
    });

    await expect(
      resolveRecoveryHref(fixtures['a verse take']),
    ).resolves.toEqual({
      status: 'open',
      href: nextHref({ projectName: '', milestoneName: '', language: '' }),
    });
  });

  it('opens without a project id when the chapter row has none', async () => {
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: null,
      projectUnitId: 3,
      bookId: 41,
      bookName: 'Mark',
      chapterNumber: 14,
    });

    const result = await resolveRecoveryHref(fixtures['a verse take']);

    expect(result).toEqual({
      status: 'open',
      href: nextHref({ projectId: null }),
    });
    if (result.status === 'open') {
      expect(result.href.params).not.toHaveProperty('projectId');
    }
  });

  it('is missing when the marker has no chapter or the chapter is gone', async () => {
    const marker = fixtures['a verse take'];
    await expect(
      resolveRecoveryHref({ ...marker, verseNumber: undefined }),
    ).resolves.toEqual({ status: 'missing' });
    expect(mockAssignment).not.toHaveBeenCalled();

    mockAssignment.mockResolvedValueOnce(null);
    await expect(resolveRecoveryHref(marker)).resolves.toEqual({
      status: 'missing',
    });
    expect(mockNames).not.toHaveBeenCalled();
  });

  it('stops before reading when the account already changed', async () => {
    await expect(
      resolveRecoveryHref(fixtures['a verse take'], () => false),
    ).resolves.toEqual({ status: 'stale' });
    expect(mockAssignment).not.toHaveBeenCalled();
  });

  it('does not open a chapter read that finishes after the account changes', async () => {
    let current = true;
    let release: (value: unknown) => void = () => {};
    mockAssignment.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );

    const pending = resolveRecoveryHref(
      fixtures['a verse take'],
      () => current,
    );
    current = false;
    release({
      id: 5,
      projectId: 9,
      projectUnitId: 3,
      bookName: 'Mark',
      chapterNumber: 14,
    });

    await expect(pending).resolves.toEqual({ status: 'stale' });
    expect(mockNames).not.toHaveBeenCalled();
  });
});
