import { getChapterAssignmentById, getChapterRouteNames } from '../db/queries';
import { hrefs } from './hrefs';
import { resolveRecoveryHref } from './recoveryHref';
import {
  classifyVerseDetailLink,
  openVerseDetailRecovery,
} from './verseDetailLink';

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: jest.fn(),
  getChapterRouteNames: jest.fn(),
}));

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockNames = getChapterRouteNames as jest.Mock;

const names = {
  projectName: 'Mark Telugu',
  milestoneName: 'Gospels Phase 1',
  language: 'Telugu',
};

describe('verse-detail links', () => {
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

  it('keeps a chapter link with no recovery on classic drafting', () => {
    expect(
      classifyVerseDetailLink({
        chapterId: '5',
        chapterName: 'Mark 14',
        projectName: 'Mark Telugu',
        language: 'Telugu',
      }),
    ).toEqual({ kind: 'classic' });
    expect(mockAssignment).not.toHaveBeenCalled();
  });

  it.each([
    ['missing chapter', {}],
    ['zero chapter', { chapterId: '0', chapterName: 'Mark 14' }],
    ['negative chapter', { chapterId: '-1', chapterName: 'Mark 14' }],
    [
      'chapter that is not a number',
      { chapterId: 'nope', chapterName: 'Mark 14' },
    ],
    ['chapter without a name', { chapterId: '5' }],
    [
      'key without a verse',
      { chapterId: '5', chapterName: 'Mark 14', recoverSessionKey: '5:23' },
    ],
    [
      'verse without a key',
      { chapterId: '5', chapterName: 'Mark 14', recoverVerse: '23' },
    ],
    [
      'verse 0',
      { chapterId: '5', recoverSessionKey: '5:23', recoverVerse: '0' },
    ],
    [
      'fractional verse',
      { chapterId: '5', recoverSessionKey: '5:23', recoverVerse: '23.5' },
    ],
    [
      'blank key',
      { chapterId: '5', recoverSessionKey: ' ', recoverVerse: '23' },
    ],
  ])('is invalid for a %s', (_label, params) => {
    expect(classifyVerseDetailLink(params)).toEqual({ kind: 'invalid' });
    expect(mockAssignment).not.toHaveBeenCalled();
  });

  it('opens a saved recovery link through the same passage as Resume', async () => {
    const marker = {
      chapterAssignmentId: 5,
      verseNumber: 23,
      sessionKey: '5:23',
    };
    const classified = classifyVerseDetailLink({
      chapterId: ['5'],
      chapterName: 'ignored',
      projectName: 'wrong project',
      language: 'wrong language',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    });
    expect(classified).toEqual({
      kind: 'recover',
      chapterId: 5,
      verse: 23,
      sessionKey: '5:23',
    });

    if (classified.kind !== 'recover') throw new Error('expected recover');
    const direct = await resolveRecoveryHref(marker);
    const link = await openVerseDetailRecovery(classified);

    expect(direct.status).toBe('open');
    if (direct.status !== 'open') throw new Error('expected open');
    expect(link).toEqual({ kind: 'passage', href: direct.href });
    if (link.kind !== 'passage') throw new Error('expected passage');
    expect(link.href.pathname).toBe('/(app)/(stack)/passage');
    expect(link.href.params).toMatchObject({
      anchorVerse: '23',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
      projectName: 'Mark Telugu',
      projectId: '9',
      projectUnitId: '3',
    });
    expect(link.href).toEqual(
      hrefs.passage({
        chapterId: 5,
        anchorVerse: 23,
        projectId: 9,
        projectUnitId: 3,
        chapterName: 'Mark 14',
        ...names,
        verse: 23,
        recover: { sessionKey: '5:23', verse: 23 },
      }),
    );
  });

  it('stays unread, then opens the original session, when names fail and then succeed', async () => {
    const classified = classifyVerseDetailLink({
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    });
    if (classified.kind !== 'recover') throw new Error('expected recover');
    mockNames.mockResolvedValueOnce(null);

    await expect(openVerseDetailRecovery(classified)).resolves.toEqual({
      kind: 'unread',
    });
    const opened = await openVerseDetailRecovery(classified);
    expect(opened.kind).toBe('passage');
    if (opened.kind !== 'passage') return;
    expect(opened.href.params).toMatchObject({
      recoverSessionKey: '5:23',
      recoverVerse: '23',
      anchorVerse: '23',
    });
  });

  it('is missing when the chapter is gone, which is not an unreadable name', async () => {
    const classified = classifyVerseDetailLink({
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    });
    if (classified.kind !== 'recover') throw new Error('expected recover');
    mockAssignment.mockResolvedValueOnce(null);

    await expect(openVerseDetailRecovery(classified)).resolves.toEqual({
      kind: 'missing',
    });
    expect(mockNames).not.toHaveBeenCalled();
  });

  it('does not open a link resolved after the account changes', async () => {
    const classified = classifyVerseDetailLink({
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    });
    if (classified.kind !== 'recover') throw new Error('expected recover');
    let current = true;
    let release: (value: unknown) => void = () => {};
    mockAssignment.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );

    const pending = openVerseDetailRecovery(classified, () => current);
    current = false;
    release({
      id: 5,
      projectId: 9,
      projectUnitId: 3,
      bookName: 'Mark',
      chapterNumber: 14,
    });

    await expect(pending).resolves.toEqual({ kind: 'stale' });
    expect(mockNames).not.toHaveBeenCalled();
  });
});
