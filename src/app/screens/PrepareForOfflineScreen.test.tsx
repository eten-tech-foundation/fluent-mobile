import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import PrepareForOfflineScreen from './PrepareForOfflineScreen';
import {
  resetMockPrepareOfflineInventory,
  setPrepareOfflineMockInventoryScenario,
} from '../../mocks/prepareOffline';

const mockHandleDownload = jest.fn();

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({ params: undefined }),
  useFocusEffect: (callback: () => void) => {
    callback();
  },
}));

jest.mock('../prepare-offline/ManageDeviceStorageSection', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    ManageDeviceStorageSection: () =>
      MockReact.createElement(View, {
        testID: 'manage-device-storage-section',
      }),
  };
});

jest.mock('../../hooks/useProjectsSummary', () => ({
  useProjectsSummary: jest.fn(() => ({
    projects: [
      {
        id: 5,
        name: 'Luke',
        target_language_name: 'Baka',
        chapterCount: 2,
        syncState: 'none',
      },
    ],
    loading: false,
    refreshing: false,
    refresh: jest.fn(),
  })),
}));

jest.mock('../../hooks/usePrepareOfflineSelection', () => ({
  usePrepareOfflineSelection: jest.fn(),
}));

jest.mock('../../hooks/usePrepareOfflineDownload', () => ({
  usePrepareOfflineDownload: jest.fn(
    ({
      catalog,
      canDownload,
    }: {
      catalog: unknown;
      canDownload: boolean;
    }) => ({
      session: 'idle',
      busy: false,
      catalogWithProgress: catalog,
      downloadButtonLabel: canDownload ? 'Download 18 MB' : 'Download 0 B',
      canDownload,
      inventoryRefreshSignal: '0',
      handleDownload: mockHandleDownload,
      pause: jest.fn(),
      resume: jest.fn(),
      cancel: jest.fn(),
    }),
  ),
}));

jest.mock('../../utils/parseUserId', () => ({
  parseUserId: () => 42,
}));

jest.mock('react-native-svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockSvg = ({ children }: { children?: unknown }) =>
    MockReact.createElement(View, null, children);
  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockSvg,
  };
});

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    ChevronLeft: MockIcon,
    ChevronRight: MockIcon,
    ChevronUp: MockIcon,
    ChevronDown: MockIcon,
    Check: MockIcon,
    SlidersHorizontal: MockIcon,
    CircleCheck: MockIcon,
    Download: MockIcon,
    Lock: MockIcon,
  };
});

jest.mock('../../components/layout/ScreenContainer', () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { usePrepareOfflineSelection } = jest.requireMock(
  '../../hooks/usePrepareOfflineSelection',
);

describe('PrepareForOfflineScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockPrepareOfflineInventory();
    setPrepareOfflineMockInventoryScenario('fresh');
    usePrepareOfflineSelection.mockImplementation(
      (projectId: number | null) => {
        if (!projectId) {
          return {
            books: [],
            chapters: [],
            loading: false,
            error: null,
            selectedIds: new Set(),
            selectedCount: 0,
            isAssignedUser: false,
            accordionExpanded: true,
            setAccordionExpanded: jest.fn(),
            expandedBookIds: new Set(),
            toggleBookExpanded: jest.fn(),
            accordionTitle: 'Selected chapters (0)',
            toggleChapter: jest.fn(),
            toggleBook: jest.fn(),
            isBookFullySelected: () => false,
            retry: jest.fn(),
          };
        }

        return {
          books: [
            {
              bookId: 1,
              bookName: 'Genesis',
              chapters: [
                {
                  id: 100,
                  bookId: 1,
                  bookName: 'Genesis',
                  chapterNumber: 1,
                  assignedUserId: 42,
                },
              ],
            },
          ],
          chapters: [
            {
              id: 100,
              bookId: 1,
              bookName: 'Genesis',
              chapterNumber: 1,
              assignedUserId: 42,
            },
          ],
          loading: false,
          error: null,
          selectedIds: new Set([100]),
          selectedCount: 1,
          isAssignedUser: true,
          accordionExpanded: true,
          setAccordionExpanded: jest.fn(),
          expandedBookIds: new Set([1]),
          toggleBookExpanded: jest.fn(),
          accordionTitle: 'Assigned chapters (1)',
          toggleChapter: jest.fn(),
          toggleBook: jest.fn(),
          isBookFullySelected: () => true,
          retry: jest.fn(),
        };
      },
    );
  });

  it('shows instruction and project picker when no project is selected', () => {
    render(<PrepareForOfflineScreen />);

    expect(
      screen.getByText(
        'Download project resources to work without a connection.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Select a project')).toBeTruthy();
    expect(screen.getByText('Luke')).toBeTruthy();
  });

  it('shows chapter accordion and resources section after selecting a project', async () => {
    render(<PrepareForOfflineScreen />);

    fireEvent.press(screen.getByText('Luke'));

    await waitFor(() => {
      expect(screen.getByText('Assigned chapters (1)')).toBeTruthy();
    });
    expect(screen.getByText('Genesis')).toBeTruthy();
    expect(screen.getByText('RESOURCES TO DOWNLOAD')).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-download-button')).toBeTruthy();
  });

  it('shows manage device storage section after selecting a project', async () => {
    render(<PrepareForOfflineScreen />);

    expect(screen.queryByTestId('manage-device-storage-section')).toBeNull();

    fireEvent.press(screen.getByText('Luke'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-device-storage-section')).toBeTruthy();
    });
  });

  it('calls handleDownload when Download is pressed', async () => {
    render(<PrepareForOfflineScreen />);

    fireEvent.press(screen.getByText('Luke'));

    await waitFor(() => {
      const button = screen.getByTestId('prepare-offline-download-button');
      expect(button.props.accessibilityState?.disabled).toBe(false);
    });

    fireEvent.press(screen.getByTestId('prepare-offline-download-button'));

    await waitFor(() => {
      expect(mockHandleDownload).toHaveBeenCalled();
    });
  });

  it('shows disabled download button for unassigned users with no chapter selection', async () => {
    usePrepareOfflineSelection.mockImplementation(() => ({
      books: [
        {
          bookId: 1,
          bookName: 'Genesis',
          chapters: [
            {
              id: 100,
              bookId: 1,
              bookName: 'Genesis',
              chapterNumber: 1,
              assignedUserId: null,
            },
          ],
        },
      ],
      chapters: [
        {
          id: 100,
          bookId: 1,
          bookName: 'Genesis',
          chapterNumber: 1,
          assignedUserId: null,
        },
      ],
      loading: false,
      error: null,
      selectedIds: new Set<number>(),
      selectedCount: 0,
      isAssignedUser: false,
      accordionExpanded: true,
      setAccordionExpanded: jest.fn(),
      expandedBookIds: new Set([1]),
      toggleBookExpanded: jest.fn(),
      accordionTitle: 'Selected chapters (0)',
      toggleChapter: jest.fn(),
      toggleBook: jest.fn(),
      isBookFullySelected: () => false,
      retry: jest.fn(),
    }));

    render(<PrepareForOfflineScreen />);

    fireEvent.press(screen.getByText('Luke'));

    await waitFor(() => {
      const button = screen.getByTestId('prepare-offline-download-button');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    expect(screen.queryByText('RESOURCES TO DOWNLOAD')).toBeNull();
    expect(mockHandleDownload).not.toHaveBeenCalled();
  });

  it('keeps download footer visible while customize panel is expanded', async () => {
    render(<PrepareForOfflineScreen />);

    fireEvent.press(screen.getByText('Luke'));

    await waitFor(() => {
      expect(
        screen.getByTestId('prepare-offline-download-footer'),
      ).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Customize download'));

    expect(screen.getByTestId('prepare-offline-download-footer')).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-download-button')).toBeTruthy();
  });
});
