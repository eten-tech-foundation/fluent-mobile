import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import PrepareForOfflineScreen from './PrepareForOfflineScreen';

const mockHandleDownload = jest.fn();

const mockPush = jest.fn();
const mockGoBack = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({} as { projectId?: string }));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockGoBack,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
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

// Mock the resources hook (data layer) so the screen test does not hit the
// real manifest fetch / DB context (#504 aggregated catalog fixture).
function mockCatalogItem(
  tier: 1 | 2 | 3,
  groupName: string,
  kind: 'text' | 'audio' | 'image',
) {
  return {
    id: `${groupName}:${kind}`,
    tier,
    kind,
    groupName,
    label: kind === 'text' ? 'Text' : kind === 'audio' ? 'Audio' : 'Image',
    bytes: 1024,
    status: 'selected' as const,
    manifestMembers: [],
  };
}

const mockCatalogItems = [
  mockCatalogItem(1, 'Source Bible', 'text'),
  mockCatalogItem(1, 'Source Bible', 'audio'),
  mockCatalogItem(2, 'Translation Words', 'text'),
  mockCatalogItem(3, 'Reference Images', 'image'),
];

jest.mock('../../hooks/usePrepareOfflineResources', () => ({
  usePrepareOfflineResources: jest.fn(
    ({
      selectedCount,
      isAssignedUser,
    }: {
      selectedCount: number;
      isAssignedUser: boolean;
    }) => {
      const emptyCatalog = {
        items: [],
        groups: [],
      };
      // Real hook returns an empty catalog when no chapters are selected.
      const catalog =
        isAssignedUser || selectedCount > 0
          ? {
              items: mockCatalogItems,
              groups: [
                {
                  groupName: 'Source Bible',
                  items: mockCatalogItems.slice(0, 2),
                },
                {
                  groupName: 'Translation Words',
                  items: [mockCatalogItems[2]],
                },
                {
                  groupName: 'Reference Images',
                  items: [mockCatalogItems[3]],
                },
              ],
            }
          : emptyCatalog;

      return {
        catalog,
        effectiveCatalog: catalog,
        deselectedItemIds: new Set<string>(),
        totalBytes: 4096,
        pendingBytes: 4096,
        selectedItems: catalog.items,
        canDownload: isAssignedUser || selectedCount > 0,
        manifestLoading: false,
        manifestError: null,
        isItemSelected: () => true,
        toggleItemSelected: jest.fn(),
      };
    },
  ),
}));

jest.mock('../../hooks/usePrepareOfflineDownload', () => ({
  usePrepareOfflineDownload: jest.fn(
    ({ catalog, canDownload }: { catalog: unknown; canDownload: boolean }) => ({
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
    mockUseLocalSearchParams.mockReturnValue({});
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
      expect(screen.getByText('Genesis')).toBeTruthy();
      expect(
        screen.getByTestId('prepare-offline-resources-section'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('prepare-offline-download-button'),
      ).toBeTruthy();
    });
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

  describe('back navigation (#503)', () => {
    it('returns to the picker instead of calling router.back() when a project was selected in-screen', async () => {
      render(<PrepareForOfflineScreen />);

      fireEvent.press(screen.getByText('Luke'));
      await waitFor(() => {
        expect(screen.getByText('Assigned chapters (1)')).toBeTruthy();
      });

      fireEvent.press(screen.getByLabelText('Go back'));

      expect(screen.getByText('Select a project')).toBeTruthy();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('returns to the picker instead of calling router.back() when the project was seeded from a route param', async () => {
      mockUseLocalSearchParams.mockReturnValue({ projectId: '5' });

      render(<PrepareForOfflineScreen />);
      await waitFor(() => {
        expect(screen.getByText('Assigned chapters (1)')).toBeTruthy();
      });

      fireEvent.press(screen.getByLabelText('Go back'));

      expect(screen.getByText('Select a project')).toBeTruthy();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('calls router.back() when already on the picker with no project selected', () => {
      render(<PrepareForOfflineScreen />);

      fireEvent.press(screen.getByLabelText('Go back'));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });
});
