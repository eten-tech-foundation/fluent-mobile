import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useObserverDraftChapter } from './useObserverDraftChapter';

const mockGetChapterAssignmentById = jest.fn();
const mockGetChapterAssignmentsWithBooks = jest.fn();
const mockGetBibleTexts = jest.fn();
const mockGetDraftChapterLocalBundle = jest.fn();
const mockGetActiveUserId = jest.fn(() => '7');
const mockGetKnownUserIds = jest.fn(() => ['7', '8']);
const mockHasProjectObserverGrant = jest.fn(
  (userId: string, projectId: number) =>
    (userId === '7' || userId === '8') && projectId === 9,
);

let mockUserSwitchEpoch = 0;

jest.mock('../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    userSwitchEpoch: mockUserSwitchEpoch,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: (id: number) => mockGetChapterAssignmentById(id),
  getChapterAssignmentsWithBooks: (projectUnitId: number) =>
    mockGetChapterAssignmentsWithBooks(projectUnitId),
  getBibleTexts: (bibleId: number, bookId: number, chapterNumber: number) =>
    mockGetBibleTexts(bibleId, bookId, chapterNumber),
}));

jest.mock('../services/draftDownload', () => ({
  getDraftChapterLocalBundle: (request: unknown) =>
    mockGetDraftChapterLocalBundle(request),
  startDraftDownload: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
  getKnownUserIds: () => mockGetKnownUserIds(),
}));

jest.mock('../services/userOrgGrants', () => ({
  hasProjectObserverGrant: (userId: string, projectId: number) =>
    mockHasProjectObserverGrant(userId, projectId),
}));

jest.mock('../services/syncEvents', () => ({
  onSyncComplete: () => () => undefined,
  onAuthReauthRequired: () => () => undefined,
}));

jest.mock('../utils/downloadQueueEvents', () => ({
  onDownloadQueueChanged: () => () => undefined,
}));

const assignment1001 = {
  id: 1001,
  projectUnitId: 50,
  projectId: 9,
  bibleId: 1,
  bookId: 40,
  chapterNumber: 1,
  bookCode: 'MAT',
  bookName: 'Matthew',
  status: 'in_progress',
  hasConflict: false,
};

const assignment1002 = {
  ...assignment1001,
  id: 1002,
  chapterNumber: 2,
};

const bundleFor = (chapterAssignmentId: number, draftText: string) => ({
  chapterAssignmentId,
  role: 'observer' as const,
  status: 'ready' as const,
  hasConflict: false,
  sourceScripture: {
    bibleId: 1,
    bookId: 40,
    chapterNumber: chapterAssignmentId === 1001 ? 1 : 2,
    verses: [{ id: 501, verseNumber: 1, text: 'Source' }],
    localFilePath: 'file:///observer/scripture.json',
  },
  units: [
    {
      bibleTextId: 501,
      verseNumber: 1,
      markers: null,
      conflictStatus: 'clean' as const,
      activeTakeId: 55,
      contentHash: 'abc',
      localPlaybackUri: 'file:///canonical/55.m4a',
      draftText,
    },
  ],
});

describe('useObserverDraftChapter scope projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSwitchEpoch = 0;
    mockGetActiveUserId.mockReturnValue('7');
    mockGetKnownUserIds.mockReturnValue(['7', '8']);
    mockHasProjectObserverGrant.mockImplementation(
      (userId: string, projectId: number) =>
        (userId === '7' || userId === '8') && projectId === 9,
    );
    mockGetChapterAssignmentsWithBooks.mockResolvedValue([]);
    mockGetBibleTexts.mockResolvedValue([]);
    mockGetChapterAssignmentById.mockImplementation(async (id: number) =>
      id === 1002 ? assignment1002 : assignment1001,
    );
  });

  it('hides prior bundle synchronously on account switch while deferred load is in flight', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    mockGetDraftChapterLocalBundle.mockImplementation(
      () =>
        new Promise(resolve => {
          resolvers.push(resolve);
        }),
    );

    const { result, rerender } = renderHook(
      ({
        chapterAssignmentId,
        projectId,
      }: {
        chapterAssignmentId: number | null;
        projectId: number | null;
      }) => useObserverDraftChapter({ chapterAssignmentId, projectId }),
      { initialProps: { chapterAssignmentId: 1001, projectId: 9 } },
    );

    await waitFor(() => {
      expect(resolvers.length).toBeGreaterThanOrEqual(1);
    });

    // Account switch + epoch bump before deferred bundle resolves.
    mockGetActiveUserId.mockReturnValue('8');
    mockUserSwitchEpoch = 1;
    rerender({ chapterAssignmentId: 1001, projectId: 9 });

    // Synchronous hide on the switched render — no prior account content.
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.draftUnits).toEqual([]);
    expect(result.current.assignment).toBeNull();

    await act(async () => {
      resolvers[0]?.(bundleFor(1001, 'ACCOUNT-7-DRAFT'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Stale deferred result must not reappear for the new session.
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.draftUnits).toEqual([]);
    expect(result.current.accountId).toBe('8');
    expect(
      result.current.draftUnits.some(u => u.draftText === 'ACCOUNT-7-DRAFT'),
    ).toBe(false);
  });

  it('hides prior bundle synchronously on route scope change while deferred load is in flight', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    mockGetDraftChapterLocalBundle.mockImplementation(
      () =>
        new Promise(resolve => {
          resolvers.push(resolve);
        }),
    );

    const { result, rerender } = renderHook(
      ({
        chapterAssignmentId,
        projectId,
      }: {
        chapterAssignmentId: number | null;
        projectId: number | null;
      }) => useObserverDraftChapter({ chapterAssignmentId, projectId }),
      { initialProps: { chapterAssignmentId: 1001, projectId: 9 } },
    );

    await waitFor(() => {
      expect(resolvers.length).toBe(1);
    });

    rerender({ chapterAssignmentId: 1002, projectId: 9 });

    expect(result.current.hasAccess).toBe(false);
    expect(result.current.draftUnits).toEqual([]);
    expect(result.current.assignment).toBeNull();

    await act(async () => {
      // Resolve the original chapter-1001 in-flight load only.
      resolvers[0]?.(bundleFor(1001, 'STALE-CHAPTER-1'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      result.current.draftUnits.some(u => u.draftText === 'STALE-CHAPTER-1'),
    ).toBe(false);
  });

  it('hides content synchronously when grant is revoked without waiting for effects', async () => {
    mockGetDraftChapterLocalBundle.mockResolvedValue(
      bundleFor(1001, 'VISIBLE'),
    );

    const { result, rerender } = renderHook(
      ({
        chapterAssignmentId,
        projectId,
      }: {
        chapterAssignmentId: number | null;
        projectId: number | null;
      }) => useObserverDraftChapter({ chapterAssignmentId, projectId }),
      { initialProps: { chapterAssignmentId: 1001, projectId: 9 } },
    );

    await waitFor(() => {
      expect(result.current.hasAccess).toBe(true);
      expect(result.current.draftUnits[0]?.draftText).toBe('VISIBLE');
    });

    mockHasProjectObserverGrant.mockReturnValue(false);
    rerender({ chapterAssignmentId: 1001, projectId: 9 });

    expect(result.current.hasAccess).toBe(false);
    expect(result.current.draftUnits).toEqual([]);
    expect(result.current.assignment).toBeNull();
  });

  it('rejects ABA return to prior account when session epoch advanced during deferred load', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    mockGetDraftChapterLocalBundle.mockImplementation(
      () =>
        new Promise(resolve => {
          resolvers.push(resolve);
        }),
    );

    const { result, rerender } = renderHook(
      ({
        chapterAssignmentId,
        projectId,
      }: {
        chapterAssignmentId: number | null;
        projectId: number | null;
      }) => useObserverDraftChapter({ chapterAssignmentId, projectId }),
      { initialProps: { chapterAssignmentId: 1001, projectId: 9 } },
    );

    await waitFor(() => {
      expect(resolvers.length).toBeGreaterThanOrEqual(1);
    });

    // A → B → A (epoch 0 → 1 → 2); deferred result still belongs to epoch 0.
    mockGetActiveUserId.mockReturnValue('8');
    mockUserSwitchEpoch = 1;
    rerender({ chapterAssignmentId: 1001, projectId: 9 });
    mockGetActiveUserId.mockReturnValue('7');
    mockUserSwitchEpoch = 2;
    rerender({ chapterAssignmentId: 1001, projectId: 9 });

    expect(result.current.hasAccess).toBe(false);
    expect(result.current.draftUnits).toEqual([]);

    await act(async () => {
      resolvers[0]?.(bundleFor(1001, 'EPOCH-0-STALE'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      result.current.draftUnits.some(u => u.draftText === 'EPOCH-0-STALE'),
    ).toBe(false);
  });
});
