import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import VerseDetailRoute from '../routes/(app)/(stack)/verse-detail';
import { hrefs } from './hrefs';

const mockBack = jest.fn();
const mockReplace = jest.fn();
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
    return <Text>{`Redirect ${href.pathname}`}</Text>;
  },
}));

jest.mock('./recoveryHref', () => ({
  resolveRecoveryHref: (...args: unknown[]) => mockResolve(...args),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => mockUserId,
}));

jest.mock('../app/screens/DraftingScreen', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Classic drafting</Text>;
  },
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
    mockParams = { chapterId: '5', chapterName: 'Mark 14' };
    mockResolve.mockResolvedValue({ status: 'open', href: passage });
  });

  it('opens classic drafting for a chapter link and does not look the chapter up', async () => {
    await render(<VerseDetailRoute />);
    expect(screen.getByText('Classic drafting')).toBeTruthy();
    expect(mockResolve).not.toHaveBeenCalled();
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
