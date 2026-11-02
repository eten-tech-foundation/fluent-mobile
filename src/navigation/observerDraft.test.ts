import { getObserverDraftDestination } from './observerDraft';

const mockGetChapterAssignmentById = jest.fn();
const mockGetActiveUserId = jest.fn(() => '7');
const mockGetKnownUserIds = jest.fn(() => ['7']);
const mockHasProjectObserverGrant = jest.fn(
  (_userId: string, _projectId: number) => true,
);

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: (id: number) => mockGetChapterAssignmentById(id),
  getChapterAssignmentsWithBooks: jest.fn(async () => []),
  getBibleTexts: jest.fn(async () => []),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
  getKnownUserIds: () => mockGetKnownUserIds(),
}));

jest.mock('../services/userOrgGrants', () => ({
  hasProjectObserverGrant: (userId: string, projectId: number) =>
    mockHasProjectObserverGrant(userId, projectId),
}));

const assignment = {
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

describe('getObserverDraftDestination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveUserId.mockReturnValue('7');
    mockGetKnownUserIds.mockReturnValue(['7']);
    mockHasProjectObserverGrant.mockReturnValue(true);
    mockGetChapterAssignmentById.mockResolvedValue(assignment);
  });

  it('returns typed href when active account has exact project Observer grant', async () => {
    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 1001,
        projectId: 9,
      }),
    ).resolves.toEqual({
      pathname: '/(app)/(stack)/observer-draft',
      params: {
        chapterAssignmentId: '1001',
        projectId: '9',
      },
    });
  });

  it('rejects non-positive IDs', async () => {
    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 0,
        projectId: 9,
      }),
    ).resolves.toBeNull();
    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 1001,
        projectId: -1,
      }),
    ).resolves.toBeNull();
    expect(mockGetChapterAssignmentById).not.toHaveBeenCalled();
  });

  it('rejects unknown / unregistered active account', async () => {
    mockGetKnownUserIds.mockReturnValue([]);
    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 1001,
        projectId: 9,
      }),
    ).resolves.toBeNull();
  });

  it('rejects missing Project Observer grant for the project', async () => {
    mockHasProjectObserverGrant.mockReturnValue(false);
    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 1001,
        projectId: 9,
      }),
    ).resolves.toBeNull();
  });

  it('rejects when local assignment projectId does not match', async () => {
    mockGetChapterAssignmentById.mockResolvedValue({
      ...assignment,
      projectId: 99,
    });
    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 1001,
        projectId: 9,
      }),
    ).resolves.toBeNull();
  });

  it('rejects when assignment is unknown', async () => {
    mockGetChapterAssignmentById.mockResolvedValue(null);
    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 1001,
        projectId: 9,
      }),
    ).resolves.toBeNull();
  });

  it('rejects when account switches during assignment lookup', async () => {
    mockGetActiveUserId.mockReturnValueOnce('7').mockReturnValue('8');
    mockGetKnownUserIds.mockReturnValue(['7', '8']);
    mockHasProjectObserverGrant.mockImplementation(
      (userId: string, projectId: number) => userId === '7' && projectId === 9,
    );

    await expect(
      getObserverDraftDestination({
        chapterAssignmentId: 1001,
        projectId: 9,
      }),
    ).resolves.toBeNull();
  });
});
