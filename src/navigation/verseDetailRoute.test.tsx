import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import VerseDetailRoute from '../routes/(app)/(stack)/verse-detail';
import { hrefs } from './hrefs';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const redirects: string[] = [];
let mockCanGoBack = true;
let mockParams: Record<string, string | undefined> = {};
let mockUserId: number | null = 7;
const mockResolve = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack,
  }),
  Redirect: ({ href }: { href: { pathname: string } }) => {
    const { Text } = require('react-native');
    redirects.push(href.pathname);
    return <Text>{`Redirect ${href.pathname}`}</Text>;
  },
}));

jest.mock('./recoveryHref', () => ({
  resolveRecoveryHref: (...args: unknown[]) => mockResolve(...args),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => mockUserId,
}));

const mockAssignment = jest.fn();
const mockNames = jest.fn();
const mockChapterOpen = jest.fn();

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: (...args: unknown[]) => mockAssignment(...args),
  getChapterRouteNames: (...args: unknown[]) => mockNames(...args),
}));

jest.mock('./chapterOpen', () => ({
  resolveAssignmentOpen: (...args: unknown[]) => mockChapterOpen(...args),
}));

const passage = hrefs.passage({
  chapterId: 5,
  anchorVerse: 23,
  projectId: 9,
  projectUnitId: 3,
  chapterName: 'Mark 14',
  projectName: 'Mark Telugu',
  milestoneName: 'Gospels Phase 1',
  language: 'Telugu',
  verse: 23,
  recover: { sessionKey: '5:23', verse: 23 },
});

describe('verse-detail route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = true;
    mockUserId = 7;
    redirects.length = 0;
    mockParams = { chapterId: '5', chapterName: 'Mark 14' };
    mockResolve.mockResolvedValue({ status: 'open', href: passage });
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
    mockChapterOpen.mockResolvedValue({ kind: 'work' });
  });

  it('opens a chapter link on the Next passage and never renders classic drafting', async () => {
    await render(<VerseDetailRoute />);
    expect(
      await screen.findByText('Redirect /(app)/(stack)/passage'),
    ).toBeTruthy();
    expect(screen.queryByText('Classic drafting')).toBeNull();
    expect(screen.queryByText('Open in classic drafting')).toBeNull();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockAssignment).toHaveBeenCalledWith(5);
  });

  it('does not redirect to the previous chapter while the next link is loading', async () => {
    const view = await render(<VerseDetailRoute />);
    expect(
      await screen.findByText('Redirect /(app)/(stack)/passage'),
    ).toBeTruthy();
    const redirectsBeforeChange = redirects.length;

    let release: (value: unknown) => void = () => {};
    mockAssignment.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    mockParams = { chapterId: '8', chapterName: 'Mark 15' };
    await view.rerender(<VerseDetailRoute />);

    expect(screen.getByTestId('verse-detail-pending')).toBeTruthy();
    expect(screen.queryByText(/Redirect/)).toBeNull();
    expect(redirects).toHaveLength(redirectsBeforeChange);

    await act(async () => {
      release({
        id: 8,
        projectId: 9,
        projectUnitId: 3,
        bookName: 'Mark',
        chapterNumber: 15,
      });
    });
    expect(
      await screen.findByText('Redirect /(app)/(stack)/passage'),
    ).toBeTruthy();
    expect(mockAssignment).toHaveBeenCalledWith(8);
  });

  it('opens an observer chapter on the read-only screen', async () => {
    mockChapterOpen.mockResolvedValue({
      kind: 'observer',
      href: {
        pathname: '/(app)/(stack)/observer-draft',
        params: { chapterAssignmentId: '5', projectId: '9' },
      },
    });
    await render(<VerseDetailRoute />);
    expect(
      await screen.findByText('Redirect /(app)/(stack)/observer-draft'),
    ).toBeTruthy();
    expect(screen.queryByText('Redirect /(app)/(stack)/passage')).toBeNull();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockNames).not.toHaveBeenCalled();
  });

  it('shows a missing chapter instead of an editor', async () => {
    mockAssignment.mockResolvedValue(null);
    await render(<VerseDetailRoute />);
    expect(await screen.findByTestId('verse-detail-missing')).toBeTruthy();
    expect(screen.queryByText(/Redirect/)).toBeNull();
    expect(mockChapterOpen).not.toHaveBeenCalled();
  });

  it('does not flash classic drafting while a recovery link resolves to the passage', async () => {
    mockParams = {
      chapterId: '5',
      chapterName: 'Mark 14',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    };
    let release: (value: unknown) => void = () => {};
    mockResolve.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );

    await render(<VerseDetailRoute />);
    expect(screen.getByTestId('verse-detail-pending')).toBeTruthy();
    expect(screen.queryByText('Classic drafting')).toBeNull();
    expect(screen.queryByText('Redirect /(app)/(stack)/passage')).toBeNull();

    await act(async () => {
      release({ status: 'open', href: passage });
    });

    expect(screen.getByText('Redirect /(app)/(stack)/passage')).toBeTruthy();
    expect(screen.queryByText('Classic drafting')).toBeNull();
    expect(mockResolve).toHaveBeenCalledWith(
      {
        chapterAssignmentId: 5,
        verseNumber: 23,
        sessionKey: '5:23',
      },
      expect.any(Function),
    );
  });

  it('offers retry when a recovery link cannot be read', async () => {
    mockParams = {
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    };
    mockResolve.mockRejectedValueOnce(new Error('db'));
    await render(<VerseDetailRoute />);
    expect(await screen.findByTestId('verse-detail-unread')).toBeTruthy();
    expect(screen.queryByText('Classic drafting')).toBeNull();
    expect(screen.queryByText(/Redirect/)).toBeNull();
  });

  it('does not open a recovery that finishes after the account changes', async () => {
    mockParams = {
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    };
    mockResolve.mockImplementation(
      (_marker: unknown, isCurrent: () => boolean) => {
        mockUserId = 8;
        return Promise.resolve(
          isCurrent() ? { status: 'open', href: passage } : { status: 'stale' },
        );
      },
    );
    await render(<VerseDetailRoute />);
    expect(await screen.findByTestId('verse-detail-stale')).toBeTruthy();
    expect(screen.queryByText('Redirect /(app)/(stack)/passage')).toBeNull();
  });

  it('ignores a recovery that resolves after the route is gone', async () => {
    mockParams = {
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    };
    let release: (value: unknown) => void = () => {};
    mockResolve.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    const view = await render(<VerseDetailRoute />);
    await view.unmount();
    await act(async () => {
      release({ status: 'open', href: passage });
    });
    expect(screen.queryByText('Redirect /(app)/(stack)/passage')).toBeNull();
  });

  it.each([
    ['invalid', { chapterId: 'nope' }, "This link isn't valid."],
    [
      'missing',
      { chapterId: '5', recoverSessionKey: '5:23', recoverVerse: '23' },
      "This couldn't be found.",
    ],
    [
      'unread',
      { chapterId: '5', recoverSessionKey: '5:23', recoverVerse: '23' },
      "This couldn't be opened. Try again.",
    ],
    [
      'stale',
      { chapterId: '5', recoverSessionKey: '5:23', recoverVerse: '23' },
      "This link didn't open. Try again.",
    ],
  ] as const)(
    'shows a %s link without throwing',
    async (kind, params, copy) => {
      mockParams = { ...params };
      if (kind !== 'invalid') {
        mockResolve.mockResolvedValue({ status: kind });
      }
      await render(<VerseDetailRoute />);
      expect(screen.getByTestId(`verse-detail-${kind}`)).toBeTruthy();
      expect(screen.getByText(copy)).toBeTruthy();
      expect(screen.queryByText('Classic drafting')).toBeNull();
      expect(screen.queryByText(/Redirect/)).toBeNull();
    },
  );

  it('retries an unreadable recovery instead of opening a different session', async () => {
    mockParams = {
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    };
    mockResolve.mockResolvedValueOnce({ status: 'unread' });
    await render(<VerseDetailRoute />);
    expect(mockResolve).toHaveBeenCalledTimes(1);

    mockResolve.mockResolvedValueOnce({ status: 'open', href: passage });
    await fireEvent.press(screen.getByTestId('verse-detail-retry'));
    expect(
      await screen.findByText('Redirect /(app)/(stack)/passage'),
    ).toBeTruthy();
    expect(mockResolve).toHaveBeenCalledTimes(2);
    expect(mockResolve).toHaveBeenLastCalledWith(
      {
        chapterAssignmentId: 5,
        verseNumber: 23,
        sessionKey: '5:23',
      },
      expect.any(Function),
    );
  });

  it('goes back from a link that is not valid', async () => {
    mockParams = {};
    await render(<VerseDetailRoute />);
    await fireEvent.press(screen.getByTestId('verse-detail-back'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces home when a bad link has nothing to go back to', async () => {
    mockCanGoBack = false;
    mockParams = {};
    await render(<VerseDetailRoute />);
    await fireEvent.press(screen.getByTestId('verse-detail-back'));
    expect(mockReplace).toHaveBeenCalledWith(hrefs.home());
  });
});
