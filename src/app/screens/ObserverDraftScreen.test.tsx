import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ObserverDraftScreen from './ObserverDraftScreen';

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ObserverDraftScreen />
    </SafeAreaProvider>,
  );
}

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

let mockParams: {
  chapterAssignmentId?: string;
  projectId?: string;
} = {
  chapterAssignmentId: '1001',
  projectId: '9',
};

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

const mockQueueListeners = new Set<() => void>();
const mockSyncListeners = new Set<() => void>();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    userSwitchEpoch: 0,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

jest.mock('../../hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => false,
}));

jest.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({ status: 'idle', failedErrorText: null }),
}));

jest.mock('../../hooks/useActiveAccountSummary', () => ({
  useActiveAccountSummary: () => ({
    hasMultipleAccounts: false,
    firstName: 'Obs',
    lastName: 'Erver',
    email: 'obs@example.com',
  }),
}));

jest.mock('../../services/syncEvents', () => ({
  onSyncComplete: (fn: () => void) => {
    mockSyncListeners.add(fn);
    return () => {
      mockSyncListeners.delete(fn);
    };
  },
  onAuthReauthRequired: () => () => undefined,
}));

jest.mock('../../utils/downloadQueueEvents', () => ({
  onDownloadQueueChanged: (fn: () => void) => {
    mockQueueListeners.add(fn);
    return () => {
      mockQueueListeners.delete(fn);
    };
  },
}));

jest.mock('../../services/draftDownload', () => ({
  getDraftChapterLocalBundle: (request: unknown) =>
    mockGetDraftChapterLocalBundle(request),
  startDraftDownload: (request: unknown) => mockStartDraftDownload(request),
}));

jest.mock('../../db/queries', () => ({
  getChapterAssignmentById: (id: number) => mockGetChapterAssignmentById(id),
  getChapterAssignmentsWithBooks: (projectUnitId: number) =>
    mockGetChapterAssignmentsWithBooks(projectUnitId),
  getBibleTexts: (bibleId: number, bookId: number, chapterNumber: number) =>
    mockGetBibleTexts(bibleId, bookId, chapterNumber),
  getRecordedVerseNumbers: jest.fn(async () => new Set()),
}));

jest.mock('../../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
  getKnownUserIds: () => mockGetKnownUserIds(),
}));

jest.mock('../../services/userOrgGrants', () => ({
  hasProjectObserverGrant: (userId: string, projectId: number) =>
    mockHasProjectObserverGrant(userId, projectId),
}));

jest.mock('../../navigation/observerDraft', () => ({
  getObserverDraftDestination: (input: {
    chapterAssignmentId: number;
    projectId: number;
  }) => mockGetObserverDraftDestination(input),
}));

jest.mock('../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => ({
    draftingUnit: 'verse',
    setDraftingUnit: jest.fn(),
  }),
}));

jest.mock('../../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(async () => null),
}));

jest.mock('../../hooks/useBibleTabUnits', () => ({
  useBibleTabUnits: () => ({
    units: [
      {
        key: 'v-1',
        kind: 'verse',
        anchorVerse: 1,
        label: '1',
        text: 'In the beginning',
        recordedStatus: 'none',
      },
    ],
    unitsPending: false,
    lastUnrecorded: null,
    draftingUnit: 'verse',
    effectiveUnit: 'verse',
  }),
}));

jest.mock('../tabs/BibleTab', () => {
  const MockReact = require('react');
  const { View, Text } = require('react-native');
  return {
    BibleTab: () =>
      MockReact.createElement(
        View,
        { testID: 'bible-tab' },
        MockReact.createElement(Text, null, 'BibleTab'),
      ),
  };
});

jest.mock('../tabs/ObserverDraftTab', () => {
  const MockReact = require('react');
  const { View, Text } = require('react-native');
  const {
    formatCanonicalObserverDraftLabel,
  } = require('../tabs/observerDraftCoverageLabel');
  return {
    ObserverDraftTab: (props: {
      units: Array<{
        bibleTextId: number;
        verseNumber: number;
        draftText: string | null;
        localPlaybackUri: string | null;
        coverage?: {
          granularity: 'verse' | 'pericope';
          startChapter: number | null;
          startVerse: number | null;
          endChapter: number | null;
          endVerse: number | null;
        } | null;
      }>;
      unresolvedConflictPlaybackPolicy: string;
      hasAccess: boolean;
    }) =>
      MockReact.createElement(
        View,
        {
          testID: 'observer-draft-tab',
          accessibilityLabel: `policy:${props.unresolvedConflictPlaybackPolicy}`,
        },
        props.hasAccess
          ? props.units.map(unit =>
              MockReact.createElement(
                View,
                {
                  key: unit.bibleTextId,
                  testID: `mock-unit-${unit.bibleTextId}`,
                },
                MockReact.createElement(
                  Text,
                  { testID: `mock-text-${unit.bibleTextId}` },
                  unit.draftText ?? 'Draft text unavailable',
                ),
                MockReact.createElement(
                  Text,
                  { testID: `mock-audio-${unit.bibleTextId}` },
                  unit.localPlaybackUri ?? 'Audio unavailable',
                ),
                MockReact.createElement(
                  Text,
                  { testID: `mock-coverage-label-${unit.bibleTextId}` },
                  formatCanonicalObserverDraftLabel(
                    unit.verseNumber,
                    unit.coverage,
                  ),
                ),
              ),
            )
          : MockReact.createElement(View, {
              testID: 'observer-draft-access-denied',
            }),
      ),
  };
});

jest.mock('../../components/layout/DraftingHeader', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    DraftingHeader: () =>
      MockReact.createElement(View, { testID: 'drafting-header' }),
  };
});

jest.mock('../../components/ui/AccountSwitcherPanel', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    AccountSwitcherPanel: () =>
      MockReact.createElement(View, { testID: 'account-switcher' }),
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
  hasConflict: false,
};

const readyBundle = {
  chapterAssignmentId: 1001,
  role: 'observer' as const,
  status: 'ready' as const,
  hasConflict: false,
  sourceScripture: {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 1,
    verses: [{ id: 501, verseNumber: 1, text: 'In the beginning' }],
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
      coverage: null,
      localPlaybackUri: 'file:///canonical/55.m4a',
      draftText: 'Target draft',
    },
  ],
};

describe('ObserverDraftScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueListeners.clear();
    mockSyncListeners.clear();

    mockParams = {
      chapterAssignmentId: '1001',
      projectId: '9',
    };
    mockGetActiveUserId.mockReturnValue('7');
    mockGetKnownUserIds.mockReturnValue(['7']);
    mockHasProjectObserverGrant.mockReturnValue(true);
    mockGetChapterAssignmentById.mockResolvedValue(assignment);
    mockGetChapterAssignmentsWithBooks.mockResolvedValue([
      {
        id: 1001,
        chapter_number: 1,
        status: 'in_progress',
        book_name: 'Matthew',
      },
      {
        id: 1002,
        chapter_number: 2,
        status: 'in_progress',
        book_name: 'Matthew',
      },
    ]);
    mockGetBibleTexts.mockResolvedValue([]);
    mockGetDraftChapterLocalBundle.mockResolvedValue(readyBundle);
    mockGetObserverDraftDestination.mockResolvedValue({
      pathname: '/(app)/(stack)/observer-draft',
      params: { chapterAssignmentId: '1002', projectId: '9' },
    });
  });

  it('shows exactly Bible and Draft tabs (no Resources / Record)', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-tab-bible')).toBeTruthy();
      expect(screen.getByTestId('observer-draft-tab-draft')).toBeTruthy();
    });
    expect(screen.queryByTestId('drafting-tab-resources')).toBeNull();
    expect(screen.queryByTestId('drafting-tab-record')).toBeNull();
    expect(screen.queryByText('Resources')).toBeNull();
    expect(screen.queryByText('Record')).toBeNull();
    expect(screen.getByText('Bible')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('reuses BibleTab and wires ObserverDraftTab read-only with undecided policy', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('bible-tab')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('observer-draft-tab-draft'));

    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-tab')).toBeTruthy();
    });
    expect(screen.getByLabelText('policy:undecided')).toBeTruthy();
    expect(screen.queryByTestId('record-take-select-55')).toBeNull();
  });

  it('never auto-starts draft download; only reads local bundle', async () => {
    renderScreen();

    await waitFor(() => {
      expect(mockGetDraftChapterLocalBundle).toHaveBeenCalled();
    });
    expect(mockStartDraftDownload).not.toHaveBeenCalled();
    expect(mockGetDraftChapterLocalBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterAssignmentId: 1001,
        projectUnitId: 50,
        projectId: 9,
        userId: 7,
        bibleId: 1,
        bookId: 40,
        bookCode: 'MAT',
        chapterNumber: 1,
        role: 'observer',
      }),
    );
  });

  it('hides prior content when Observer grant is lost', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('bible-tab')).toBeTruthy();
    });

    mockHasProjectObserverGrant.mockReturnValue(false);
    // Trigger refresh via queue event subscription
    await act(async () => {
      mockQueueListeners.forEach(fn => fn());
    });

    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-no-access')).toBeTruthy();
    });
    expect(screen.queryByTestId('bible-tab')).toBeNull();
    expect(screen.queryByTestId('observer-draft-tab')).toBeNull();
  });

  it('clears stale bundle content after grant loss mid-session', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-chapter-browse')).toBeTruthy();
    });

    mockHasProjectObserverGrant.mockReturnValue(false);
    mockGetDraftChapterLocalBundle.mockResolvedValue({
      ...readyBundle,
      units: [
        {
          ...readyBundle.units[0],
          draftText: 'STALE SHOULD NOT RENDER',
        },
      ],
    });
    await act(async () => {
      mockSyncListeners.forEach(fn => fn());
    });

    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-no-access')).toBeTruthy();
    });
    expect(screen.queryByText('STALE SHOULD NOT RENDER')).toBeNull();
    expect(screen.queryByText('Target draft')).toBeNull();
  });

  it('browses same-unit chapters through destination guard', async () => {
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByTestId('observer-draft-chapter-chip-1002'),
      ).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('observer-draft-chapter-chip-1002'));

    await waitFor(() => {
      expect(mockGetObserverDraftDestination).toHaveBeenCalledWith({
        chapterAssignmentId: 1002,
        projectId: 9,
      });
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/(stack)/observer-draft',
        params: { chapterAssignmentId: '1002', projectId: '9' },
      });
    });
  });

  it('surfaces missing draft text/audio honestly on Draft tab', async () => {
    mockGetDraftChapterLocalBundle.mockResolvedValue({
      ...readyBundle,
      units: [
        {
          bibleTextId: 501,
          verseNumber: 1,
          markers: null,
          conflictStatus: null,
          activeTakeId: null,
          contentHash: null,
          coverage: null,
          localPlaybackUri: null,
          draftText: null,
        },
      ],
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-tab-draft')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('observer-draft-tab-draft'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-text-501')).toHaveTextContent(
        'Draft text unavailable',
      );
      expect(screen.getByTestId('mock-audio-501')).toHaveTextContent(
        'Audio unavailable',
      );
    });
  });

  it('loader bundle coverage reaches Draft tab labels (same/cross-chapter + null legacy)', async () => {
    mockGetDraftChapterLocalBundle.mockResolvedValue({
      ...readyBundle,
      units: [
        {
          ...readyBundle.units[0],
          verseNumber: 3,
          coverage: {
            granularity: 'pericope',
            startChapter: 1,
            startVerse: 3,
            endChapter: 1,
            endVerse: 7,
          },
        },
      ],
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-tab-draft')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('observer-draft-tab-draft'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-coverage-label-501')).toHaveTextContent(
        'Canonical draft - Pericope - vv. 3-7',
      );
    });
    expect(screen.getAllByTestId('mock-unit-501')).toHaveLength(1);
    expect(mockStartDraftDownload).not.toHaveBeenCalled();
    expect(screen.getByLabelText('policy:undecided')).toBeTruthy();

    mockGetDraftChapterLocalBundle.mockResolvedValue({
      ...readyBundle,
      units: [
        {
          ...readyBundle.units[0],
          verseNumber: 30,
          coverage: {
            granularity: 'pericope',
            startChapter: 1,
            startVerse: 30,
            endChapter: 2,
            endVerse: 5,
          },
        },
      ],
    });
    await act(async () => {
      mockQueueListeners.forEach(fn => fn());
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-coverage-label-501')).toHaveTextContent(
        'Canonical draft - Pericope - vv. 1:30-2:5',
      );
    });
    expect(screen.getAllByTestId('mock-unit-501')).toHaveLength(1);

    mockGetDraftChapterLocalBundle.mockResolvedValue({
      ...readyBundle,
      units: [
        {
          ...readyBundle.units[0],
          verseNumber: 3,
          coverage: null,
        },
      ],
    });
    await act(async () => {
      mockQueueListeners.forEach(fn => fn());
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-coverage-label-501')).toHaveTextContent(
        'Canonical draft - v. 3',
      );
    });
    expect(screen.queryByText(/Verse/)).toBeNull();
    expect(mockStartDraftDownload).not.toHaveBeenCalled();
  });

  it('hides content for invalid route params', async () => {
    mockParams = { chapterAssignmentId: 'abc', projectId: '9' };
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('observer-draft-no-access')).toBeTruthy();
    });
    expect(mockGetDraftChapterLocalBundle).not.toHaveBeenCalled();
  });
});
