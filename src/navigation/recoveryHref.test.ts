import { getChapterAssignmentById, getChapterRouteNames } from '../db/queries';
import type { PausedTakeMarker } from '../services/pausedTakes';
import { hrefs } from './hrefs';
import { resolveRecoveryHref } from './recoveryHref';

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: jest.fn(),
  getChapterRouteNames: jest.fn(),
}));

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockNames = getChapterRouteNames as jest.Mock;

const marker: PausedTakeMarker = {
  sessionKey: '5:22',
  segments: [],
  elapsedMs: 4000,
  startedAt: '2026-11-01T10:00:00Z',
  chapterAssignmentId: 5,
  verseNumber: 22,
};
const capture = {
  bibleTextId: 1,
  startChapter: 14,
  startVerse: 22,
  endChapter: 14,
  endVerse: 25,
};
const legacyHref = hrefs.verseDetail({
  chapterId: 5,
  chapterName: 'Mark 14',
  projectName: '',
  language: '',
  recoverSessionKey: '5:22',
  recoverVerse: 22,
});

describe('resolveRecoveryHref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      projectUnitId: 3,
      bookName: 'Mark',
      chapterNumber: 14,
    });
    mockNames.mockResolvedValue({
      projectName: 'Mark Telugu',
      milestoneName: 'Gospels Phase 1',
      language: 'Telugu',
    });
  });

  it('reopens the passage in Next, which picks the take back up', async () => {
    await expect(
      resolveRecoveryHref(
        { ...marker, capture: { ...capture, granularity: 'pericope' } },
        'next',
      ),
    ).resolves.toEqual(
      hrefs.passage({
        chapterId: 5,
        anchorVerse: 22,
        projectId: 9,
        projectUnitId: 3,
        chapterName: 'Mark 14',
        projectName: 'Mark Telugu',
        milestoneName: 'Gospels Phase 1',
        language: 'Telugu',
      }),
    );
  });

  it('opens Legacy drafting in Legacy', async () => {
    await expect(resolveRecoveryHref(marker, 'legacy')).resolves.toEqual(
      legacyHref,
    );
  });

  it("opens Legacy drafting for a verse take, which Next can't hold", async () => {
    await expect(
      resolveRecoveryHref(
        { ...marker, capture: { ...capture, granularity: 'verse' } },
        'next',
      ),
    ).resolves.toEqual(legacyHref);
  });

  it('opens Legacy drafting for a marker that never recorded its capture', async () => {
    await expect(
      resolveRecoveryHref({ ...marker, capture: undefined }, 'next'),
    ).resolves.toEqual(legacyHref);
  });

  it('is null when the marker has no chapter or the chapter is gone', async () => {
    await expect(
      resolveRecoveryHref({ ...marker, verseNumber: undefined }, 'next'),
    ).resolves.toBeNull();
    mockAssignment.mockResolvedValueOnce(null);
    await expect(resolveRecoveryHref(marker, 'next')).resolves.toBeNull();
  });
});
