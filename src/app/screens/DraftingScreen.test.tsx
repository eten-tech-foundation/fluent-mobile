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
    }) => {
      capturedHeaderHandlers = props;
      return MockReact.createElement(View, { testID: 'drafting-header' });
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
    }: {
      onChapterClaimed?: () => void;
      onCaptureActiveChange?: (active: boolean) => void;
      onRegisterCaptureControls?: (
        controls: import('../../types/captureControls').CaptureControls | null,
      ) => void;
    }) => {
      capturedOnChapterClaimed = onChapterClaimed;
      capturedRecordTabHandlers = {
        onCaptureActiveChange,
        onRegisterCaptureControls,
      };
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

    it('does not re-prompt when the deferred back races the discard window', async () => {
      await renderWithActiveCapture();

      const beforeRemoveCalls = mockAddListener.mock.calls.filter(
        call => call[0] === 'beforeRemove',
      );
      expect(beforeRemoveCalls.length).toBeGreaterThan(0);
      const beforeRemove = beforeRemoveCalls[beforeRemoveCalls.length - 1][1];

      const preventDefault = jest.fn();
      beforeRemove({ preventDefault });
      expect(Alert.alert).toHaveBeenCalledTimes(1);

      // Discard confirmed → capture ends → deferred back runs, but a slow
      // async gap lets beforeRemove fire once more before it lands (#49).
      lastAlertButtons()
        .find(b => b.text === 'Discard')
        ?.onPress?.();

      beforeRemove({ preventDefault: jest.fn() });
      expect(Alert.alert).toHaveBeenCalledTimes(1); // no second prompt
      expect(preventDefault).toHaveBeenCalledTimes(1); // pop allowed

      await waitFor(() => {
        expect(mockDiscard).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(mockBack).toHaveBeenCalledTimes(1);
      });
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
