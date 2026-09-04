import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import DraftingScreen from './DraftingScreen';

const mockBack = jest.fn();
const mockPush = jest.fn();

let capturedOnChapterClaimed: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
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
    DraftingHeader: () =>
      MockReact.createElement(View, { testID: 'drafting-header' }),
  };
});

jest.mock('../../components/layout/DraftingTabBar', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    DraftingTabBar: () =>
      MockReact.createElement(View, { testID: 'drafting-tab-bar' }),
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
  const { Pressable, Text } = require('react-native');
  return {
    RecordTab: ({ onChapterClaimed }: { onChapterClaimed?: () => void }) => {
      capturedOnChapterClaimed = onChapterClaimed;
      return MockReact.createElement(
        Pressable,
        {
          testID: 'mock-record-tab-claim',
          onPress: () => onChapterClaimed?.(),
        },
        MockReact.createElement(Text, null, 'Mock Record'),
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

const mockGetChapterAssignmentById = jest.fn();
const mockGetBibleTexts = jest.fn();
const mockGetRecordedVerseNumbers = jest.fn();

jest.mock('../../db/queries', () => ({
  getChapterAssignmentById: (...args: unknown[]) =>
    mockGetChapterAssignmentById(...args),
  getBibleTexts: (...args: unknown[]) => mockGetBibleTexts(...args),
  getRecordedVerseNumbers: (...args: unknown[]) =>
    mockGetRecordedVerseNumbers(...args),
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
});
