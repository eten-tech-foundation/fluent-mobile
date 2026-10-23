import React from 'react';
import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import DraftingScreen from './DraftingScreen';
import { hrefs } from '../../navigation/hrefs';
import { setLastActiveTab } from '../../utils/draftingTabState';
const mockBack = jest.fn();
const mockPush = jest.fn();
type BeforeRemoveListener = (event: { preventDefault: () => void }) => void;
const mockAddListener = jest.fn<jest.Mock, [string, BeforeRemoveListener]>(() =>
  jest.fn(),
);

let capturedOnChapterClaimed: (() => void) | undefined;
let capturedRecordTabHandlers: {
  onCaptureActiveChange?: (active: boolean) => void;
  onRegisterCaptureControls?: (
    controls: import('../../types/captureControls').CaptureControls | null,
  ) => void;
} | null = null;
let capturedHeaderHandlers: {
  onSyncPress?: () => void;
  onAccountPress?: () => void;
  rightAccessory?: React.ReactNode;
} | null = null;
let capturedTabBarHandlers: {
  onTabChange?: (tab: 'bible' | 'resources' | 'record') => void;
} | null = null;

const mockResume = jest.fn().mockResolvedValue(undefined);
const mockDiscard = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
  useNavigation: () => ({
    addListener: mockAddListener,
  }),
  useLocalSearchParams: () => ({
    chapterId: '5',
    chapterName: 'Mark 14',
  }),
}));

jest.mock('../../utils/parseUserId', () => ({
  parseUserId: () => 99,
}));

const mockDraftCommentsSurface = {
  drawerVisible: false,
  comments: [],
  loading: false,
  canCompose: false,
  canReact: false,
  isRecording: false,
  recordedAudioUri: null,
  playingCommentId: null,
  chapterCommentCount: 1,
  commentCountByBibleTextId: new Map(),
  commentCountByPericopeNumber: new Map(),
  composerText: '',
  composerBodyEmoji: null,
  openForAnchor: jest.fn(),
  openForVerse: jest.fn(),
  openForPericope: jest.fn(),
  openChapter: jest.fn(),
  dismiss: jest.fn(),
  onRecordStart: jest.fn(),
  onRecordStop: jest.fn(),
  onClearRecordedAudio: jest.fn(),
  onComposerTextChange: jest.fn(),
  onComposerBodyEmojiChange: jest.fn(),
  onSend: jest.fn(async () => false),
  onReaction: jest.fn(),
  onPlayPauseCommentAudio: jest.fn(),
  onReplyRootChange: jest.fn(),
  refresh: jest.fn(),
};

const mockUseDraftCommentsSurface = jest.fn(
  (_options?: unknown) => mockDraftCommentsSurface,
);

jest.mock('../../hooks/useDraftCommentsSurface', () => ({
  useDraftCommentsSurface: (options: unknown) =>
    mockUseDraftCommentsSurface(options),
}));

jest.mock('../../components/comments/DraftCommentsSurface', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    DraftCommentsDrawerHost: (props: { testID?: string }) =>
      MockReact.createElement(View, {
        testID: props.testID ?? 'draft-comments-drawer',
      }),
    DraftCommentsEntryButton: (props: { testID?: string }) =>
      MockReact.createElement(View, {
        testID: props.testID ?? 'draft-comments-entry',
      }),
  };
});

jest.mock('../../hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => false,
}));

jest.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({ status: 'idle' }),
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

jest.mock('../../hooks/useActiveAccountSummary', () => ({
  useActiveAccountSummary: () => ({
    hasMultipleAccounts: false,
    firstName: 'Jon',
    lastName: 'See',
    email: 'jon@example.com',
  }),
}));

jest.mock('../../services/syncEvents', () => ({
  onSyncComplete: () => jest.fn(),
}));

jest.mock('../../services/sync', () => ({
  syncBibleTexts: jest.fn().mockResolvedValue(undefined),
  syncMasterData: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/draftingTabState', () => ({
  getLastActiveTab: () => 'record',
  setLastActiveTab: jest.fn(),
}));

jest.mock('../../components/layout/DraftingHeader', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    DraftingHeader: (props: {
      onSyncPress?: () => void;
      onAccountPress?: () => void;
      rightAccessory?: React.ReactNode;
    }) => {
      capturedHeaderHandlers = props;
      return MockReact.createElement(
        View,
        { testID: 'drafting-header' },
        props.rightAccessory,
      );
    },
  };
});

jest.mock('../../components/layout/DraftingTabBar', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    DraftingTabBar: (props: {
      onTabChange?: (tab: 'bible' | 'resources' | 'record') => void;
    }) => {
      capturedTabBarHandlers = props;
      return MockReact.createElement(View, { testID: 'drafting-tab-bar' });
    },
  };
});

jest.mock('../../components/layout/ScreenContainer', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    ScreenContainer: ({ children }: { children?: React.ReactNode }) =>
      MockReact.createElement(View, { testID: 'screen-container' }, children),
  };
});

jest.mock('../../components/ui/AccountSwitcherPanel', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    AccountSwitcherPanel: () =>
      MockReact.createElement(View, { testID: 'account-switcher-panel' }),
  };
});

jest.mock('../tabs/RecordTab', () => {
  const MockReact = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    RecordTab: ({
      onChapterClaimed,
      onCaptureActiveChange,
      onRegisterCaptureControls,
      onActiveCommentAnchorChange,
      onOpenComments,
      activeUnitCommentCount,
    }: {
      onChapterClaimed?: () => void;
      onCaptureActiveChange?: (active: boolean) => void;
      onRegisterCaptureControls?: (
        controls: import('../../types/captureControls').CaptureControls | null,
      ) => void;
      onActiveCommentAnchorChange?: (
        anchor: { kind: 'verse'; bibleTextId: number } | null,
      ) => void;
      onOpenComments?: () => void;
      activeUnitCommentCount?: number | null;
    }) => {
      capturedOnChapterClaimed = onChapterClaimed;
      capturedRecordTabHandlers = {
        onCaptureActiveChange,
        onRegisterCaptureControls,
      };
      // Simulate Record publishing a verse comment anchor once mounted.
      MockReact.useEffect(() => {
        onActiveCommentAnchorChange?.({ kind: 'verse', bibleTextId: 401 });
      }, [onActiveCommentAnchorChange]);
      return MockReact.createElement(
        View,
        null,
        MockReact.createElement(
          Pressable,
          {
            testID: 'mock-record-tab-claim',
            onPress: () => onChapterClaimed?.(),
          },
          MockReact.createElement(Text, null, 'Mock Record'),
        ),
        MockReact.createElement(
          Pressable,
          {
            testID: 'record-comment-entry',
            onPress: () => onOpenComments?.(),
          },
          MockReact.createElement(
            Text,
            { testID: 'record-unit-comment-count' },
            String(activeUnitCommentCount ?? 'none'),
          ),
        ),
        MockReact.createElement(Pressable, {
          testID: 'mock-record-tab-activate',
          onPress: () => {
            onCaptureActiveChange?.(true);
            onRegisterCaptureControls?.({
              resume: mockResume,
              discardCapture: mockDiscard,
            });
          },
        }),
        MockReact.createElement(Pressable, {
          testID: 'mock-record-tab-deactivate',
          onPress: () => {
            onCaptureActiveChange?.(false);
            onRegisterCaptureControls?.(null);
          },
        }),
      );
    },
  };
});

jest.mock('../tabs/BibleTab', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    BibleTab: () => MockReact.createElement(View, { testID: 'bible-tab' }),
  };
});

jest.mock('../tabs/ResourcesTab', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    ResourcesTab: () =>
      MockReact.createElement(View, { testID: 'resources-tab' }),
  };
});

jest.mock('../../components/layout/SourceAudioShell', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    SourceAudioProvider: ({ children }: { children?: React.ReactNode }) =>
      children,
    SourceAudioBarSlot: () =>
      MockReact.createElement(View, { testID: 'source-audio-bar-slot' }),
    useSourceAudioControl: () => null,
    useSourceAudioRecordTabIntegration: jest.fn(),
  };
});

const mockGetChapterAssignmentById = jest.fn();
const mockGetBibleTexts = jest.fn();
const mockGetRecordedVerseNumbers = jest.fn();

jest.mock('../../db/queries', () => ({
  getChapterAssignmentById: (...args: unknown[]) =>
    mockGetChapterAssignmentById(...args),
  getBibleTexts: (...args: unknown[]) => mockGetBibleTexts(...args),
  getRecordedVerseNumbers: (...args: unknown[]) =>
    mockGetRecordedVerseNumbers(...args),
  getPericopesForChapter: jest.fn(async () => []),
  getSelectedTakeCoverages: jest.fn(async () => []),
}));

const baseAssignment = {
  id: 5,
  projectUnitId: 10,
  projectId: 1,
  bibleId: 1,
  bookId: 40,
  chapterNumber: 14,
  assignedUserId: undefined,
  status: 'in_progress',
  bibleName: 'BSB',
  bookCode: 'MRK',
  sourceLanguageCode: 'eng',
};

describe('DraftingScreen onChapterClaimed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnChapterClaimed = undefined;
    capturedRecordTabHandlers = null;
    capturedHeaderHandlers = null;
    capturedTabBarHandlers = null;
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetChapterAssignmentById
      .mockResolvedValueOnce(baseAssignment)
      .mockResolvedValueOnce({
        ...baseAssignment,
        assignedUserId: 99,
      });
    mockGetBibleTexts.mockResolvedValue([
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 14,
        verseNumber: 1,
        text: 'Verse one',
      },
    ]);
    mockGetRecordedVerseNumbers.mockResolvedValue(new Set());
  });

  it('refetches chapter assignment without reloading verses', async () => {
    render(<DraftingScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-record-tab-claim')).toBeTruthy();
    });
    expect(mockGetChapterAssignmentById).toHaveBeenCalledTimes(1);
    expect(mockGetBibleTexts).toHaveBeenCalledTimes(1);
    // DraftingScreen + DraftingContext (#279) each load recorded verses on mount.
    expect(mockGetRecordedVerseNumbers).toHaveBeenCalledTimes(2);

    fireEvent.press(screen.getByTestId('mock-record-tab-claim'));

    await waitFor(() => {
      expect(mockGetChapterAssignmentById).toHaveBeenCalledTimes(2);
    });
    expect(mockGetChapterAssignmentById).toHaveBeenLastCalledWith(5);
    expect(mockGetBibleTexts).toHaveBeenCalledTimes(1);
    expect(mockGetRecordedVerseNumbers).toHaveBeenCalledTimes(2);
    expect(capturedOnChapterClaimed).toBeDefined();
  });

  it('renders the shell source-audio bar slot above the tab bar', async () => {
    render(<DraftingScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('source-audio-bar-slot')).toBeTruthy();
    });
  });

  it('wires read-only Record comments entry + drawer host', async () => {
    mockDraftCommentsSurface.commentCountByBibleTextId = new Map([[401, 4]]);
    render(<DraftingScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('drafting-record-comments-entry')).toBeTruthy();
      expect(
        screen.getByTestId('drafting-record-comments-drawer'),
      ).toBeTruthy();
      expect(screen.getByTestId('record-comment-entry')).toBeTruthy();
      expect(mockUseDraftCommentsSurface).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterAssignmentId: 5,
          enabled: true,
          canCompose: false,
          canReact: false,
          activeCommentAnchor: { kind: 'verse', bibleTextId: 401 },
        }),
      );
    });
    expect(capturedHeaderHandlers?.rightAccessory).toBeTruthy();
    expect(screen.getByTestId('record-unit-comment-count')).toHaveTextContent(
      '4',
    );

    fireEvent.press(screen.getByTestId('record-comment-entry'));
    expect(mockDraftCommentsSurface.openForAnchor).toHaveBeenCalledWith({
      kind: 'verse',
      bibleTextId: 401,
    });
  });

  it('does not enable comments while Bible tab is active', async () => {
    render(<DraftingScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('drafting-tab-bar')).toBeTruthy();
    });
    capturedTabBarHandlers?.onTabChange?.('bible');
    await waitFor(() => {
      expect(mockUseDraftCommentsSurface).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          canCompose: false,
          canReact: false,
        }),
      );
    });
  });

  // --- #49: leave prompt with Resume / Discard ------------------------------

  describe('capture leave prompt (#49)', () => {
    /** Render with an active capture and return the discard handler. */
    async function renderWithActiveCapture() {
      render(<DraftingScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('mock-record-tab-activate')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('mock-record-tab-activate'));
      expect(
        capturedRecordTabHandlers?.onRegisterCaptureControls,
      ).toBeDefined();
      expect(mockDiscard).not.toHaveBeenCalled();
      return mockDiscard;
    }

    function lastAlertButtons(): { text: string; onPress?: () => void }[] {
      const calls = (Alert.alert as jest.Mock).mock.calls;
      const last = calls[calls.length - 1] as [
        string,
        string,
        { text: string; onPress?: () => void }[],
      ];
      return last[2];
    }

    it('tab change away from Record offers Resume/Discard; Discard proceeds', async () => {
      await renderWithActiveCapture();

      capturedTabBarHandlers?.onTabChange?.('bible');

      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Recording in progress',
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Resume' }),
          expect.objectContaining({ text: 'Discard' }),
        ]),
      );
      expect(mockDiscard).not.toHaveBeenCalled();

      lastAlertButtons()
        .find(b => b.text === 'Discard')
        ?.onPress?.();

      await waitFor(() => {
        expect(mockDiscard).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(setLastActiveTab).toHaveBeenCalledWith(5, 'bible');
      });
    });

    it('tab change keeps the capture on Resume', async () => {
      await renderWithActiveCapture();

      capturedTabBarHandlers?.onTabChange?.('bible');

      lastAlertButtons()
        .find(b => b.text === 'Resume')
        ?.onPress?.();

      expect(mockDiscard).not.toHaveBeenCalled();
      expect(setLastActiveTab).not.toHaveBeenCalled();
    });

    it('header back offers Resume/Discard; Discard navigates back', async () => {
      await renderWithActiveCapture(); // The guard re-registers when recordCaptureActive flips — use the
      // latest registration (closes over recordCaptureActive=true).
      const beforeRemoveCalls = mockAddListener.mock.calls.filter(
        call => call[0] === 'beforeRemove',
      );
      expect(beforeRemoveCalls.length).toBeGreaterThan(0);
      const beforeRemove = beforeRemoveCalls[beforeRemoveCalls.length - 1][1];

      const preventDefault = jest.fn();
      beforeRemove({ preventDefault });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      lastAlertButtons()
        .find(b => b.text === 'Discard')
        ?.onPress?.();

      await waitFor(() => {
        expect(mockDiscard).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(mockBack).toHaveBeenCalledTimes(1);
      });
    });

    it('blocks a second back while discard is pending, then allows exactly one pop', async () => {
      let resolveDiscard: () => void = () => {};
      mockDiscard.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveDiscard = resolve;
          }),
      );
      await renderWithActiveCapture();

      const beforeRemoveCalls = mockAddListener.mock.calls.filter(
        call => call[0] === 'beforeRemove',
      );
      const beforeRemove = beforeRemoveCalls[beforeRemoveCalls.length - 1][1];

      // 1st back → prompt → Discard (stop is now "in flight").
      beforeRemove({ preventDefault: jest.fn() });
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      lastAlertButtons()
        .find(b => b.text === 'Discard')
        ?.onPress?.();

      // 2nd back while discard is pending: blocked, no new prompt, no pop.
      const secondPrevent = jest.fn();
      beforeRemove({ preventDefault: secondPrevent });
      expect(secondPrevent).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();

      // Discard finishes → the deferred back runs exactly once.
      resolveDiscard();
      await waitFor(() => {
        expect(mockBack).toHaveBeenCalledTimes(1);
      });

      // That pop passes the guard (one-shot suppress) and does not re-prompt.
      const popPrevent = jest.fn();
      beforeRemove({ preventDefault: popPrevent });
      expect(popPrevent).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });
    it('Sync tap offers Resume/Discard; Discard pushes the Sync page', async () => {
      await renderWithActiveCapture();

      capturedHeaderHandlers?.onSyncPress?.();

      expect(Alert.alert).toHaveBeenCalledTimes(1);

      lastAlertButtons()
        .find(b => b.text === 'Discard')
        ?.onPress?.();

      await waitFor(() => {
        expect(mockDiscard).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(hrefs.sync);
      });
    });

    it('account switcher offers Resume/Discard; Discard opens the switcher', async () => {
      await renderWithActiveCapture();

      capturedHeaderHandlers?.onAccountPress?.();

      expect(Alert.alert).toHaveBeenCalledTimes(1);

      lastAlertButtons()
        .find(b => b.text === 'Discard')
        ?.onPress?.();

      await waitFor(() => {
        expect(mockDiscard).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId('account-switcher-panel')).toBeTruthy();
      });
    });

    it('inactive capture leaves navigation unguarded', async () => {
      render(<DraftingScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('mock-record-tab-deactivate')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('mock-record-tab-deactivate'));

      capturedTabBarHandlers?.onTabChange?.('bible');
      capturedHeaderHandlers?.onSyncPress?.();

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(setLastActiveTab).toHaveBeenCalledWith(5, 'bible');
      expect(mockPush).toHaveBeenCalledWith(hrefs.sync);
    });
  });
});
