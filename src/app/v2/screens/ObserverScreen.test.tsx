import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ObserverScreen, { draftNotice } from './ObserverScreen';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockFocused = true;
let mockParams: { chapterAssignmentId?: string; projectId?: string } = {};
let mockEpoch = 0;

const mockStartDraftDownload = jest.fn();
const mockGetDraftChapterLocalBundle = jest.fn();
const mockGetChapterAssignmentById = jest.fn();
const mockGetChapterAssignmentsWithBooks = jest.fn();
const mockGetBibleTexts = jest.fn();
const mockGetActiveUserId = jest.fn(() => '7');
const mockGetKnownUserIds = jest.fn(() => ['7']);
const mockHasProjectObserverGrant = jest.fn(
  (_userId: string, _projectId: number) => true,
);
const mockGetObserverDraftDestination = jest.fn();
const mockRepositoryCalls: string[] = [];
const mockGetProjectPericopeSetId = jest.fn(
  async (_projectId: number): Promise<number | null> => null,
);
const mockGetPericopesForChapter = jest.fn(async (..._args: unknown[]) => []);
let mockDraftingUnit: 'verse' | 'pericope' = 'verse';
const mockQueueListeners = new Set<() => void>();

const mockLoad = jest.fn(async (_uri: string) => undefined);
const mockResume = jest.fn(async (..._args: unknown[]) => undefined);
const mockStop = jest.fn(async () => undefined);
const mockPause = jest.fn(async () => undefined);
const mockSeek = jest.fn(async (_ms: number) => undefined);
const mockPlayback = { positionMs: 0, durationMs: 0 };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => mockFocused,
}));

jest.mock('../../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({ userSwitchEpoch: mockEpoch }),
}));

jest.mock('../../../hooks/useHeaderSync', () => ({
  useHeaderSync: () => ({
    status: 'online_pending',
    failedErrorText: null,
    openSync: jest.fn(),
  }),
}));

jest.mock('../../../services/syncEvents', () => ({
  onSyncComplete: () => () => undefined,
  onAuthReauthRequired: () => () => undefined,
}));

jest.mock('../../../utils/downloadQueueEvents', () => ({
  onDownloadQueueChanged: (fn: () => void) => {
    mockQueueListeners.add(fn);
    return () => mockQueueListeners.delete(fn);
  },
}));

jest.mock('../../../services/draftDownload', () => ({
  getDraftChapterLocalBundle: (request: unknown) =>
    mockGetDraftChapterLocalBundle(request),
  startDraftDownload: (request: unknown) => mockStartDraftDownload(request),
}));

jest.mock('../../../db/queries', () => ({
  getChapterAssignmentById: (id: number) => mockGetChapterAssignmentById(id),
  getChapterAssignmentsWithBooks: (projectUnitId: number) =>
    mockGetChapterAssignmentsWithBooks(projectUnitId),
  getBibleTexts: (bibleId: number, bookId: number, chapterNumber: number) =>
    mockGetBibleTexts(bibleId, bookId, chapterNumber),
  getPericopesForChapter: (...args: unknown[]) =>
    mockGetPericopesForChapter(...args),
  getSelectedTakeCoverages: async () => [],
}));

jest.mock('../../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => ({
    draftingUnit: mockDraftingUnit,
    setDraftingUnit: jest.fn(),
  }),
}));

// The pericope-set read is the only repository call the source pane makes.
// Any recording / take / stage write would land in mockRepositoryCalls.
jest.mock(
  '../../../db/repository',
  () =>
    new Proxy(
      {},
      {
        get: (_target, name) => {
          if (name === '__esModule') return true;
          if (name === 'getProjectPericopeSetId') {
            return (projectId: number) =>
              mockGetProjectPericopeSetId(projectId);
          }
          return (..._args: unknown[]) => {
            mockRepositoryCalls.push(String(name));
          };
        },
      },
    ),
);

jest.mock('../../../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
  getKnownUserIds: () => mockGetKnownUserIds(),
}));

jest.mock('../../../services/userOrgGrants', () => ({
  hasProjectObserverGrant: (userId: string, projectId: number) =>
    mockHasProjectObserverGrant(userId, projectId),
}));

jest.mock('../../../navigation/observerDraft', () => ({
  getObserverDraftDestination: (input: unknown) =>
    mockGetObserverDraftDestination(input),
}));

jest.mock('../../../hooks/usePlaybackEngine', () => {
  const ReactActual = require('react');
  return {
    usePlaybackEngine: () => {
      const [status, setStatus] = ReactActual.useState('idle');
      const load = ReactActual.useCallback((uri: string) => mockLoad(uri), []);
      const resume = ReactActual.useCallback(async (...args: unknown[]) => {
        await mockResume(...args);
        setStatus('playing');
      }, []);
      // Stops land on a later microtask; keep them stateless so they never
      // update the screen outside act().
      const stop = ReactActual.useCallback(() => mockStop(), []);
      const pause = ReactActual.useCallback(async () => {
        setStatus('paused');
        await mockPause();
      }, []);
      const seek = ReactActual.useCallback((ms: number) => mockSeek(ms), []);
      return {
        load,
        resume,
        stop,
        pause,
        seek,
        play: jest.fn(),
        status,
        positionMs: mockPlayback.positionMs,
        durationMs: mockPlayback.durationMs,
      };
    },
  };
});

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
};

function unit(overrides: Record<string, unknown> = {}) {
  return {
    bibleTextId: 501,
    verseNumber: 1,
    markers: null,
    conflictStatus: 'clean',
    activeTakeId: 55,
    contentHash: 'abc',
    localPlaybackUri: 'file:///canonical/55.m4a',
    draftText: 'Target draft',
    ...overrides,
  };
}

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    chapterAssignmentId: 1001,
    role: 'observer',
    status: 'ready',
    hasConflict: false,
    sourceScripture: {
      bibleId: 1,
      bookId: 40,
      chapterNumber: 1,
      verses: [{ id: 501, verseNumber: 1, text: 'In the beginning' }],
      localFilePath: 'file:///observer/scripture.json',
    },
    units: [unit()],
    ...overrides,
  };
}

function screenTree() {
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

function renderScreen() {
  return render(screenTree());
}

async function openDraft() {
  await waitFor(() => expect(screen.getByTestId('observer-tab-draft')));
  await fireEvent.press(screen.getByTestId('observer-tab-draft'));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ObserverScreen (Next)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepositoryCalls.length = 0;
    mockQueueListeners.clear();
    mockFocused = true;
    mockEpoch = 0;
    mockDraftingUnit = 'verse';
    mockGetProjectPericopeSetId.mockResolvedValue(null);
    mockGetPericopesForChapter.mockResolvedValue([]);
    mockPlayback.positionMs = 0;
    mockPlayback.durationMs = 0;
    mockParams = { chapterAssignmentId: '1001', projectId: '9' };
    mockGetActiveUserId.mockReturnValue('7');
    mockGetKnownUserIds.mockReturnValue(['7']);
    mockHasProjectObserverGrant.mockReturnValue(true);
    mockGetChapterAssignmentById.mockResolvedValue(assignment);
    mockGetChapterAssignmentsWithBooks.mockResolvedValue([
      { id: 1001, chapter_number: 1, status: 'x', book_name: 'Matthew' },
      { id: 1002, chapter_number: 2, status: 'x', book_name: 'Matthew' },
    ]);
    mockGetBibleTexts.mockResolvedValue([]);
    mockGetDraftChapterLocalBundle.mockResolvedValue(bundle());
    mockGetObserverDraftDestination.mockResolvedValue({
      pathname: '/(app)/(stack)/observer-draft',
      params: { chapterAssignmentId: '1002', projectId: '9' },
    });
  });

  it('shows the permitted chapter source and canonical draft from the local bundle', async () => {
    await renderScreen();

    expect(await screen.findByText('In the beginning')).toBeTruthy();
    expect(screen.getByText('Matthew 1')).toBeTruthy();
    expect(screen.getByText('Observer · Read only')).toBeTruthy();

    await openDraft();
    expect(screen.getByTestId('observer-draft-text-501')).toHaveTextContent(
      'Target draft',
    );
    expect(screen.queryByTestId('observer-draft-notice')).toBeNull();
    expect(mockStartDraftDownload).not.toHaveBeenCalled();
    expect(mockGetDraftChapterLocalBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterAssignmentId: 1001,
        projectId: 9,
        userId: 7,
        role: 'observer',
      }),
    );
  });

  it('has no Record, take choice, delete or stage action and writes nothing', async () => {
    await renderScreen();
    await openDraft();
    await screen.findByTestId('observer-draft-play-501');

    for (const text of [/record/i, /delete/i, /send/i, /official/i]) {
      expect(screen.queryByText(text)).toBeNull();
      expect(screen.queryByLabelText(text)).toBeNull();
    }
    await fireEvent.press(screen.getByTestId('observer-draft-play-501'));
    await waitFor(() => expect(mockResume).toHaveBeenCalled());
    expect(mockRepositoryCalls).toEqual([]);
  });

  it('plays the exact canonical take with its full reference', async () => {
    await renderScreen();
    await openDraft();

    const play = await screen.findByLabelText(
      'Play canonical draft, Matthew 1:1',
    );
    await fireEvent.press(play);

    await waitFor(() =>
      expect(mockLoad).toHaveBeenCalledWith('file:///canonical/55.m4a'),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Pause canonical draft, Matthew 1:1'),
      ).toBeTruthy(),
    );
  });

  it('seeks only the loaded take', async () => {
    mockPlayback.durationMs = 10000;
    await renderScreen();
    await openDraft();
    await fireEvent.press(await screen.findByTestId('observer-draft-play-501'));

    const track = await screen.findByTestId('observer-draft-seek-501');
    await fireEvent(track, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(mockSeek).toHaveBeenCalledWith(5000);
  });

  it.each([
    ['unknown conflict status', { conflictStatus: null }, 'Audio unavailable'],
    [
      'unresolved conflict under the undecided policy',
      { conflictStatus: 'conflict' },
      'Audio unavailable',
    ],
    ['no canonical take', { activeTakeId: null }, 'No draft recording'],
    [
      'media not on the phone',
      { localPlaybackUri: null },
      'Audio not downloaded',
    ],
  ])('keeps audio unplayable for %s', async (_name, overrides, copy) => {
    mockGetDraftChapterLocalBundle.mockResolvedValue(
      bundle({ units: [unit(overrides)] }),
    );
    await renderScreen();
    await openDraft();

    expect(
      await screen.findByTestId('observer-draft-audio-unavailable-501'),
    ).toHaveTextContent(copy);
    expect(screen.queryByTestId('observer-draft-play-501')).toBeNull();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('says when draft text is missing instead of inventing it', async () => {
    mockGetDraftChapterLocalBundle.mockResolvedValue(
      bundle({ units: [unit({ draftText: '  ' })] }),
    );
    await renderScreen();
    await openDraft();
    expect(
      await screen.findByTestId('observer-draft-text-unavailable-501'),
    ).toHaveTextContent('Draft text unavailable');
  });

  it('shows a scoped state when the chapter was never prepared offline', async () => {
    mockGetDraftChapterLocalBundle.mockResolvedValue(
      bundle({ status: 'idle', units: [], sourceScripture: null }),
    );
    await renderScreen();

    expect(await screen.findByTestId('observer-source-empty')).toBeTruthy();
    await openDraft();
    expect(screen.getByTestId('observer-draft-notice')).toHaveTextContent(
      "This chapter's draft isn't on this phone yet.",
    );
  });

  it('flags an incomplete bundle while still showing what is there', async () => {
    mockGetDraftChapterLocalBundle.mockResolvedValue(
      bundle({ status: 'failed' }),
    );
    await renderScreen();
    await openDraft();
    expect(screen.getByTestId('observer-draft-notice')).toHaveTextContent(
      "Some of this chapter's draft didn't download.",
    );
    expect(screen.getByTestId('observer-draft-text-501')).toBeTruthy();
  });

  it('never shows content to an account without the project Observer grant', async () => {
    mockHasProjectObserverGrant.mockReturnValue(false);
    await renderScreen();
    expect(await screen.findByTestId('observer-no-access')).toBeTruthy();
    expect(mockGetDraftChapterLocalBundle).not.toHaveBeenCalled();
  });

  it('never shows content to an account that is not registered on the phone', async () => {
    mockGetKnownUserIds.mockReturnValue([]);
    await renderScreen();
    expect(await screen.findByTestId('observer-no-access')).toBeTruthy();
    expect(mockGetDraftChapterLocalBundle).not.toHaveBeenCalled();
  });

  it('drops a late load from the previous account after an account switch', async () => {
    const pending = deferred<unknown>();
    mockGetDraftChapterLocalBundle.mockReturnValueOnce(pending.promise);
    mockGetDraftChapterLocalBundle.mockResolvedValue(
      bundle({ units: [unit({ draftText: 'Account eight draft' })] }),
    );
    const view = await renderScreen();
    await waitFor(() =>
      expect(mockGetDraftChapterLocalBundle).toHaveBeenCalledTimes(1),
    );

    mockGetKnownUserIds.mockReturnValue(['7', '8']);
    mockGetActiveUserId.mockReturnValue('8');
    mockEpoch = 1;
    await view.rerender(screenTree());
    await act(async () => {
      pending.resolve(
        bundle({ units: [unit({ draftText: 'STALE account seven draft' })] }),
      );
    });

    await openDraft();
    expect(await screen.findByText('Account eight draft')).toBeTruthy();
    expect(screen.queryByText('STALE account seven draft')).toBeNull();
    expect(mockGetDraftChapterLocalBundle).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 8 }),
    );
  });

  it('stops playback and drops the old content when the account switches', async () => {
    const view = await renderScreen();
    await openDraft();
    await fireEvent.press(await screen.findByTestId('observer-draft-play-501'));
    await screen.findByLabelText('Pause canonical draft, Matthew 1:1');
    mockStop.mockClear();
    const pending = deferred<unknown>();
    mockGetDraftChapterLocalBundle.mockReturnValueOnce(pending.promise);

    mockGetKnownUserIds.mockReturnValue(['7', '8']);
    mockGetActiveUserId.mockReturnValue('8');
    mockEpoch = 1;
    await view.rerender(screenTree());

    await waitFor(() => expect(mockStop).toHaveBeenCalled());
    expect(screen.queryByText('Target draft')).toBeNull();
    expect(
      screen.queryByLabelText('Pause canonical draft, Matthew 1:1'),
    ).toBeNull();
    await act(async () => {
      pending.resolve(bundle());
    });
  });

  it('clears content and stops playback when the grant is revoked', async () => {
    await renderScreen();
    await openDraft();
    await fireEvent.press(await screen.findByTestId('observer-draft-play-501'));
    await waitFor(() => expect(mockResume).toHaveBeenCalled());
    mockStop.mockClear();

    mockHasProjectObserverGrant.mockReturnValue(false);
    await act(async () => {
      mockQueueListeners.forEach(fn => fn());
    });

    await waitFor(() =>
      expect(screen.getByTestId('observer-no-access')).toBeTruthy(),
    );
    expect(screen.queryByText('Target draft')).toBeNull();
    expect(mockStop).toHaveBeenCalled();
  });

  it('hides content and stops playback on blur, then re-checks access on return', async () => {
    const view = await renderScreen();
    await openDraft();
    await fireEvent.press(await screen.findByTestId('observer-draft-play-501'));
    await waitFor(() => expect(mockResume).toHaveBeenCalled());
    mockStop.mockClear();
    const accessReads = mockGetChapterAssignmentById.mock.calls.length;

    mockFocused = false;
    await view.rerender(screenTree());
    await waitFor(() => expect(mockStop).toHaveBeenCalled());
    expect(screen.queryByText('Target draft')).toBeNull();

    mockFocused = true;
    await view.rerender(screenTree());
    await waitFor(() =>
      expect(mockGetChapterAssignmentById.mock.calls.length).toBeGreaterThan(
        accessReads,
      ),
    );
    expect(await screen.findByText('Target draft')).toBeTruthy();
  });

  it('shows no access, not a spinner, when the grant is lost while away', async () => {
    const view = await renderScreen();
    await screen.findByText('In the beginning');

    mockFocused = false;
    await view.rerender(screenTree());
    mockHasProjectObserverGrant.mockReturnValue(false);
    mockFocused = true;
    await view.rerender(screenTree());

    expect(await screen.findByTestId('observer-no-access')).toBeTruthy();
    expect(screen.queryByTestId('observer-loading')).toBeNull();
    expect(screen.queryByText('In the beginning')).toBeNull();
  });

  it('changes chapter only through the destination guard', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('observer-chapter-1002'));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/(stack)/observer-draft',
        params: { chapterAssignmentId: '1002', projectId: '9' },
      }),
    );
    expect(mockGetObserverDraftDestination).toHaveBeenCalledWith({
      chapterAssignmentId: 1002,
      projectId: 9,
    });
  });

  it('stays put when the guard denies the next chapter', async () => {
    mockGetObserverDraftDestination.mockResolvedValue(null);
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('observer-chapter-1002'));
    await waitFor(() =>
      expect(mockGetObserverDraftDestination).toHaveBeenCalled(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows source pericopes with their full range titles', async () => {
    mockDraftingUnit = 'pericope';
    mockGetProjectPericopeSetId.mockResolvedValue(3);
    mockGetPericopesForChapter.mockResolvedValue([
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 1, verseNumber: 1 },
          { chapterNumber: 1, verseNumber: 2 },
        ],
      },
    ] as never);
    mockGetDraftChapterLocalBundle.mockResolvedValue(
      bundle({
        sourceScripture: {
          bibleId: 1,
          bookId: 40,
          chapterNumber: 1,
          verses: [
            { id: 501, verseNumber: 1, text: 'In the beginning' },
            { id: 502, verseNumber: 2, text: 'was the Word' },
          ],
          localFilePath: 'file:///observer/scripture.json',
        },
      }),
    );
    await renderScreen();

    expect(await screen.findByText('Matthew 1:1–2')).toBeTruthy();
    expect(screen.getByText('1 In the beginning 2 was the Word')).toBeTruthy();
    expect(screen.queryByTestId('observer-pericope-unavailable')).toBeNull();
  });

  it('titles a pericope that crosses into the next chapter in full', async () => {
    mockDraftingUnit = 'pericope';
    mockGetProjectPericopeSetId.mockResolvedValue(3);
    mockGetPericopesForChapter.mockResolvedValue([
      {
        pericopeNumber: '4',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 1, verseNumber: 1 },
          { chapterNumber: 2, verseNumber: 1 },
        ],
      },
    ] as never);
    mockGetBibleTexts.mockImplementation(
      async (bibleId: number, bookId: number, chapterNumber: number) =>
        chapterNumber === 2
          ? [{ bibleId, bookId, chapterNumber, verseNumber: 1, text: 'Next' }]
          : [],
    );
    await renderScreen();

    expect(await screen.findByText('Matthew 1:1–2:1')).toBeTruthy();
    expect(await screen.findByText('1 In the beginning 1 Next')).toBeTruthy();
  });

  it('says when pericopes are unavailable and falls back to verses', async () => {
    mockDraftingUnit = 'pericope';
    await renderScreen();
    expect(
      await screen.findByTestId('observer-pericope-unavailable'),
    ).toBeTruthy();
    expect(screen.getByText('Verse 1')).toBeTruthy();
  });

  it('does not navigate when the screen blurs before the chapter check returns', async () => {
    const pending = deferred<unknown>();
    mockGetObserverDraftDestination.mockReturnValue(pending.promise);
    const view = await renderScreen();
    await fireEvent.press(await screen.findByTestId('observer-chapter-1002'));

    mockFocused = false;
    await view.rerender(screenTree());
    await act(async () => {
      pending.resolve({
        pathname: '/(app)/(stack)/observer-draft',
        params: { chapterAssignmentId: '1002', projectId: '9' },
      });
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('draftNotice', () => {
  it('covers each bundle state', () => {
    expect(draftNotice('ready', 3)).toBeNull();
    expect(draftNotice('ready', 0)).toBe('No draft for this chapter yet.');
    expect(draftNotice(null, 0)).toBe(
      "This chapter's draft isn't on this phone yet.",
    );
    expect(draftNotice('downloading', 0)).toBe(
      "This chapter's draft is downloading.",
    );
    expect(draftNotice('queued', 2)).toBe(
      "Some of this chapter's draft is still downloading.",
    );
  });
});
