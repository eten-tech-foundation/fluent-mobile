import { getChapterAssignmentById } from '../db/queries';
import { isUserProjectMember } from '../db/repository';
import { resolveAssignmentOpen, resolveChapterOpen } from './chapterOpen';
import { getObserverDraftDestination } from './observerDraft';

let mockActiveUserId: string | null = '7';
let mockObserverIds: number[] = [];
let mockTranslatorIds: number[] = [];

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockActiveUserId,
}));
jest.mock('../utils/parseUserId', () => ({ parseUserId: () => 7 }));
jest.mock('../services/userOrgGrants', () => ({
  getObserverProjectIds: () => mockObserverIds,
}));
jest.mock('../utils/myWorkDraftDownload', () => ({
  getTranslatorProjectIds: () => mockTranslatorIds,
}));
jest.mock('../db/repository', () => ({ isUserProjectMember: jest.fn() }));
jest.mock('../db/queries', () => ({ getChapterAssignmentById: jest.fn() }));
jest.mock('./observerDraft', () => ({
  getObserverDraftDestination: jest.fn(),
}));

const mockMember = isUserProjectMember as jest.Mock;
const mockDestination = getObserverDraftDestination as jest.Mock;
const mockAssignment = getChapterAssignmentById as jest.Mock;
const observerHref = {
  pathname: '/(app)/(stack)/observer-draft',
  params: { chapterAssignmentId: '5', projectId: '9' },
};
const chapter = {
  chapterId: 5,
  projectId: 9,
  assignmentStatus: 'draft',
  assignedUserId: 7,
  peerCheckerId: null,
};
const current = () => true;

describe('resolveChapterOpen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUserId = '7';
    mockObserverIds = [];
    mockTranslatorIds = [];
    mockMember.mockResolvedValue(true);
    mockDestination.mockResolvedValue(observerHref);
  });

  it('opens my own drafting chapter to work on', async () => {
    await expect(resolveChapterOpen(chapter, current)).resolves.toEqual({
      kind: 'work',
    });
  });

  it("views a chapter that isn't mine", async () => {
    await expect(
      resolveChapterOpen({ ...chapter, assignedUserId: 8 }, current),
    ).resolves.toEqual({ kind: 'view' });
  });

  it('sends an observer to the read-only view, never the editable one', async () => {
    mockObserverIds = [9];
    await expect(
      resolveChapterOpen(
        { ...chapter, assignmentStatus: 'community_review', assignedUserId: 8 },
        current,
      ),
    ).resolves.toEqual({ kind: 'observer', href: observerHref });
  });

  it('stops when observer access no longer checks out', async () => {
    mockObserverIds = [9];
    mockMember.mockResolvedValue(false);
    await expect(
      resolveChapterOpen(
        { ...chapter, assignmentStatus: 'community_review', assignedUserId: 8 },
        current,
      ),
    ).resolves.toBeNull();
  });

  it('stops when the tap was superseded', async () => {
    mockObserverIds = [9];
    await expect(
      resolveChapterOpen(
        { ...chapter, assignmentStatus: 'community_review', assignedUserId: 8 },
        () => false,
      ),
    ).resolves.toBeNull();
  });

  it('stops when the account has changed', async () => {
    mockActiveUserId = '8';
    await expect(resolveChapterOpen(chapter, current)).resolves.toBeNull();
  });

  it('stops when the account changes while the observer checks are running', async () => {
    mockObserverIds = [9];
    let resolveMember: (member: boolean) => void = () => {};
    mockMember.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveMember = resolve;
        }),
    );
    const pending = resolveChapterOpen(
      { ...chapter, assignmentStatus: 'community_review', assignedUserId: 8 },
      current,
    );
    mockActiveUserId = '8';
    resolveMember(true);
    await expect(pending).resolves.toBeNull();
  });

  it('stops when membership is gone by the last observer check', async () => {
    mockObserverIds = [9];
    mockMember.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(
      resolveChapterOpen(
        { ...chapter, assignmentStatus: 'community_review', assignedUserId: 8 },
        current,
      ),
    ).resolves.toBeNull();
  });

  it('stops when the observer grant is revoked mid-check', async () => {
    mockObserverIds = [9];
    mockMember.mockImplementationOnce(async () => {
      mockObserverIds = [];
      return true;
    });
    await expect(
      resolveChapterOpen(
        { ...chapter, assignmentStatus: 'community_review', assignedUserId: 8 },
        current,
      ),
    ).resolves.toBeNull();
  });

  it('stops when the Translator grant is gone before an open peer check opens', async () => {
    const openPeer = {
      ...chapter,
      assignmentStatus: 'peer_check',
      assignedUserId: 8,
    };
    let reads = 0;
    const ids = jest.requireMock('../utils/myWorkDraftDownload') as {
      getTranslatorProjectIds: () => number[];
    };
    const original = ids.getTranslatorProjectIds;
    ids.getTranslatorProjectIds = () => {
      reads += 1;
      return reads === 1 ? [9] : [];
    };
    try {
      await expect(resolveChapterOpen(openPeer, current)).resolves.toBeNull();
      expect(reads).toBeGreaterThan(1);
    } finally {
      ids.getTranslatorProjectIds = original;
    }
  });

  it('opens an open peer check only with a Translator grant', async () => {
    const openPeer = {
      ...chapter,
      assignmentStatus: 'peer_check',
      assignedUserId: 8,
    };
    mockTranslatorIds = [9];
    await expect(resolveChapterOpen(openPeer, current)).resolves.toEqual({
      kind: 'work',
    });
    mockTranslatorIds = [];
    await expect(resolveChapterOpen(openPeer, current)).resolves.toEqual({
      kind: 'view',
    });
  });
});

describe('resolveAssignmentOpen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUserId = '7';
    mockObserverIds = [];
  });

  it('loads the chapter, then resolves it', async () => {
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      status: 'draft',
      assignedUserId: 7,
    });
    await expect(resolveAssignmentOpen(5, current)).resolves.toEqual({
      kind: 'work',
    });
  });

  it('is null for a missing chapter', async () => {
    mockAssignment.mockResolvedValue(null);
    await expect(resolveAssignmentOpen(5, current)).resolves.toBeNull();
  });
});
