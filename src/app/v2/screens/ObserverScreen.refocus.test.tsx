import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ObserverScreen from './ObserverScreen';
import type { ObserverDraftChapterState } from '../../../hooks/useObserverDraftChapter';

let mockFocused = true;
const mockRefresh = jest.fn();
let mockChapter: ObserverDraftChapterState;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ chapterAssignmentId: '1001', projectId: '9' }),
  useIsFocused: () => mockFocused,
}));

jest.mock('../../../hooks/useHeaderSync', () => ({
  useHeaderSync: () => ({
    status: 'online_pending',
    failedErrorText: null,
    openSync: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useObserverDraftChapter', () => ({
  useObserverDraftChapter: () => mockChapter,
}));

jest.mock('../../../navigation/observerDraft', () => ({
  getObserverDraftDestination: jest.fn(),
}));

jest.mock('../../../hooks/useBibleTabUnits', () => ({
  useBibleTabUnits: () => ({
    units: [
      {
        key: 'verse:1',
        draftingUnit: 'verse',
        verses: [{ chapterNumber: 1, verseNumber: 1 }],
        title: '1',
        anchorVerse: 1,
        previewText: 'In the beginning',
        bodyVerses: [],
        recordedStatus: 'none',
      },
    ],
    unitsPending: false,
    draftingUnit: 'verse',
    effectiveUnit: 'verse',
  }),
}));

jest.mock('../../../hooks/usePlaybackEngine', () => ({
  usePlaybackEngine: () => ({
    load: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(async () => undefined),
    pause: jest.fn(),
    seek: jest.fn(),
    play: jest.fn(),
    status: 'idle',
    positionMs: 0,
    durationMs: 0,
  }),
}));

function chapterState(
  overrides: Partial<ObserverDraftChapterState> = {},
): ObserverDraftChapterState {
  return {
    loading: false,
    hasAccess: true,
    accountId: '7',
    assignment: {
      id: 1001,
      projectUnitId: 50,
      projectId: 9,
      bibleId: 1,
      bookId: 40,
      chapterNumber: 1,
      bookCode: 'MAT',
      bookName: 'Matthew',
      status: 'in_progress',
    } as ObserverDraftChapterState['assignment'],
    sourceVerses: [
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 1,
        verseNumber: 1,
        text: 'In the beginning',
      },
    ],
    draftUnits: [],
    unitChapters: [],
    bundleStatus: 'ready',
    refresh: mockRefresh,
    ...overrides,
  };
}

function tree() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ObserverScreen />
    </SafeAreaProvider>
  );
}

describe('ObserverScreen refocus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockChapter = chapterState();
  });

  it('keeps the old chapter hidden until the access re-check has run', async () => {
    const view = await render(tree());
    expect(screen.getByText('In the beginning')).toBeTruthy();

    mockFocused = false;
    await view.rerender(tree());
    expect(screen.queryByText('In the beginning')).toBeNull();

    // Back in focus with the stored state still granting access.
    mockFocused = true;
    await view.rerender(tree());
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('In the beginning')).toBeNull();
    expect(screen.getByTestId('observer-loading')).toBeTruthy();

    mockChapter = chapterState({ loading: true, hasAccess: false });
    await view.rerender(tree());
    expect(screen.queryByText('In the beginning')).toBeNull();

    mockChapter = chapterState();
    await act(async () => {
      await view.rerender(tree());
    });
    expect(screen.getByText('In the beginning')).toBeTruthy();
  });
});
