import {
  getChapterAssignmentById,
  getChapterRouteNames,
  getPericopeForVerse,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import { getDraftingUnit } from '../services/draftingUnitPreference';
import type { PausedTakeMarker } from '../services/pausedTakes';
import { hrefs } from './hrefs';
import { resolveRecoveryHref } from './recoveryHref';

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: jest.fn(),
  getChapterRouteNames: jest.fn(),
  getPericopeForVerse: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../services/draftingUnitPreference', () => ({
  getDraftingUnit: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => '7',
}));

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockNames = getChapterRouteNames as jest.Mock;
const mockPericope = getPericopeForVerse as jest.Mock;
const mockSetId = getProjectPericopeSetId as jest.Mock;
const mockUnit = getDraftingUnit as jest.Mock;

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
      bookId: 41,
      bookName: 'Mark',
      chapterNumber: 14,
    });
    mockNames.mockResolvedValue({
      projectName: 'Mark Telugu',
      milestoneName: 'Gospels Phase 1',
      language: 'Telugu',
    });
    mockSetId.mockResolvedValue(3);
    mockUnit.mockReturnValue('pericope');
    mockPericope.mockResolvedValue({
      verses: [
        { chapterNumber: 14, verseNumber: 22 },
        { chapterNumber: 14, verseNumber: 25 },
      ],
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

  it('opens Legacy drafting when the take was paused after the passage start', async () => {
    mockPericope.mockResolvedValue({
      verses: [
        { chapterNumber: 14, verseNumber: 3 },
        { chapterNumber: 14, verseNumber: 8 },
      ],
    });

    await expect(
      resolveRecoveryHref(
        {
          ...marker,
          verseNumber: 8,
          capture: { ...capture, startVerse: 3, granularity: 'pericope' },
        },
        'next',
      ),
    ).resolves.toEqual(
      hrefs.verseDetail({
        chapterId: 5,
        chapterName: 'Mark 14',
        projectName: '',
        language: '',
        recoverSessionKey: '5:22',
        recoverVerse: 8,
      }),
    );
  });

  it('opens Legacy drafting in Legacy', async () => {
    await expect(resolveRecoveryHref(marker, 'legacy')).resolves.toEqual(
      legacyHref,
    );
  });

  const versePassage = (verse: number) =>
    hrefs.passage({
      chapterId: 5,
      anchorVerse: verse,
      projectId: 9,
      projectUnitId: 3,
      chapterName: 'Mark 14',
      projectName: 'Mark Telugu',
      milestoneName: 'Gospels Phase 1',
      language: 'Telugu',
      verse,
    });

  it('reopens a verse take on its verse when Next records verse by verse', async () => {
    mockUnit.mockReturnValue('verse');

    await expect(
      resolveRecoveryHref(
        {
          ...marker,
          verseNumber: 23,
          capture: { ...capture, granularity: 'verse' },
        },
        'next',
      ),
    ).resolves.toEqual(versePassage(23));
    expect(mockUnit).toHaveBeenCalledWith('7');
  });

  it('reopens a verse take in a chapter without pericopes, whatever the setting', async () => {
    mockPericope.mockResolvedValue(null);

    await expect(
      resolveRecoveryHref(
        { ...marker, capture: { ...capture, granularity: 'verse' } },
        'next',
      ),
    ).resolves.toEqual(versePassage(22));
  });

  it('opens Legacy drafting for a passage take while Next records verse by verse', async () => {
    mockUnit.mockReturnValue('verse');

    await expect(
      resolveRecoveryHref(
        { ...marker, capture: { ...capture, granularity: 'pericope' } },
        'next',
      ),
    ).resolves.toEqual(legacyHref);
  });

  it('opens Legacy drafting for a verse take while Next records passages', async () => {
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
