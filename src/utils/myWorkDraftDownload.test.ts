import { hasProjectObserverGrant } from '../services/userOrgGrants';
import { getActiveUserId } from '../services/storage';
import { parseUserId } from './parseUserId';
import {
  buildMyWorkDraftDownloadRequest,
  classifyMyWorkDraftDownloadRole,
  getValidatedMyWorkDownloadUserId,
} from './myWorkDraftDownload';

jest.mock('../services/userOrgGrants', () => ({
  hasProjectObserverGrant: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(),
}));

jest.mock('./parseUserId', () => ({
  parseUserId: jest.fn(),
}));

const mockHasProjectObserverGrant =
  hasProjectObserverGrant as jest.MockedFunction<
    typeof hasProjectObserverGrant
  >;
const mockGetActiveUserId = getActiveUserId as jest.MockedFunction<
  typeof getActiveUserId
>;
const mockParseUserId = parseUserId as jest.MockedFunction<typeof parseUserId>;

const peerChapterIds = {
  id: 99,
  projectUnitId: 11,
  projectId: 3,
  bibleId: 5,
  bookId: 41,
  bookCode: 'MRK',
  chapterNumber: 2,
  assignmentStatus: 'peer_check',
  peerCheckerId: 7,
} as const;

describe('myWorkDraftDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasProjectObserverGrant.mockReturnValue(false);
    mockGetActiveUserId.mockReturnValue('7');
    mockParseUserId.mockReturnValue(7);
  });

  it('requires synced parseUserId to exactly match active account', () => {
    expect(getValidatedMyWorkDownloadUserId()).toBe(7);

    mockGetActiveUserId.mockReturnValue('8');
    expect(getValidatedMyWorkDownloadUserId()).toBeNull();

    mockGetActiveUserId.mockReturnValue('7');
    mockParseUserId.mockReturnValue(8);
    expect(getValidatedMyWorkDownloadUserId()).toBeNull();

    mockParseUserId.mockReturnValue(null);
    expect(getValidatedMyWorkDownloadUserId()).toBeNull();
  });

  it('classifies assigned peer checker rows as peer_check', () => {
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'peer_check',
        peerCheckerId: 7,
        projectId: 3,
      }),
    ).toBe('peer_check');
    expect(mockHasProjectObserverGrant).not.toHaveBeenCalled();
  });

  it('does not classify when assigned peer checker is a different user', () => {
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 8,
        assignmentStatus: 'peer_check',
        peerCheckerId: 7,
        projectId: 3,
      }),
    ).toBeNull();
  });

  it('does not classify translator draft/not_started rows for download', () => {
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'draft',
        peerCheckerId: null,
        projectId: 3,
      }),
    ).toBeNull();
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'not_started',
        peerCheckerId: null,
        projectId: 3,
      }),
    ).toBeNull();
  });

  it('does not classify open peer_check without a peer checker (gap)', () => {
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'peer_check',
        peerCheckerId: null,
        projectId: 3,
      }),
    ).toBeNull();
  });

  it('classifies observer review stages only with a known Project Observer grant', () => {
    mockHasProjectObserverGrant.mockReturnValue(true);
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'community_review',
        peerCheckerId: null,
        projectId: 3,
      }),
    ).toBe('observer');
    expect(mockHasProjectObserverGrant).toHaveBeenCalledWith('7', 3);

    mockHasProjectObserverGrant.mockReturnValue(false);
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'linguist_check',
        peerCheckerId: null,
        projectId: 3,
      }),
    ).toBeNull();
  });

  it('returns null when observer grant is revoked or for another project', () => {
    mockHasProjectObserverGrant.mockImplementation(
      (userId, projectId) => userId === '7' && projectId === 3,
    );

    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'community_review',
        peerCheckerId: null,
        projectId: 99,
      }),
    ).toBeNull();
    expect(mockHasProjectObserverGrant).toHaveBeenCalledWith('7', 99);

    mockHasProjectObserverGrant.mockReturnValue(false);
    expect(
      classifyMyWorkDraftDownloadRole({
        userId: 7,
        assignmentStatus: 'community_review',
        peerCheckerId: null,
        projectId: 3,
      }),
    ).toBeNull();
  });

  it('builds an exact DraftDownloadRequest for eligible peer_check rows', () => {
    const request = buildMyWorkDraftDownloadRequest(peerChapterIds, 7);

    expect(request).toEqual({
      chapterAssignmentId: 99,
      projectUnitId: 11,
      projectId: 3,
      userId: 7,
      bibleId: 5,
      bookId: 41,
      bookCode: 'MRK',
      chapterNumber: 2,
      role: 'peer_check',
    });
  });

  it('re-evaluates live eligibility for the current user and assignment fields', () => {
    // Account-7 peer row must not authorize account 8.
    expect(
      buildMyWorkDraftDownloadRequest(
        {
          ...peerChapterIds,
          peerCheckerId: 7,
        },
        8,
      ),
    ).toBeNull();

    expect(
      buildMyWorkDraftDownloadRequest(
        {
          ...peerChapterIds,
          assignmentStatus: 'draft',
          peerCheckerId: null,
        },
        7,
      ),
    ).toBeNull();
  });

  it('returns null request when identifiers are incomplete', () => {
    expect(
      buildMyWorkDraftDownloadRequest(
        {
          ...peerChapterIds,
          bookCode: '  ',
        },
        7,
      ),
    ).toBeNull();

    expect(
      buildMyWorkDraftDownloadRequest(
        {
          ...peerChapterIds,
          projectUnitId: 0,
        },
        7,
      ),
    ).toBeNull();
  });
});
