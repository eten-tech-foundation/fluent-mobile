import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import PrepareForOfflineScreen from './PrepareForOfflineScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({ params: undefined }),
}));

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
    CircleCheck: MockIcon,
  };
});

jest.mock('../../components/layout/ScreenContainer', () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
}));

const { usePrepareOfflineSelection } = jest.requireMock(
  '../../hooks/usePrepareOfflineSelection',
);

describe('PrepareForOfflineScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePrepareOfflineSelection.mockImplementation(
      (projectId: number | null) => {
        if (!projectId) {
          return {
            books: [],
            loading: false,
            error: null,
            selectedIds: new Set(),
            accordionExpanded: true,
            setAccordionExpanded: jest.fn(),
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
          loading: false,
          error: null,
          selectedIds: new Set([100]),
          accordionExpanded: true,
          setAccordionExpanded: jest.fn(),
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

  it('shows chapter accordion after selecting a project', async () => {
    render(<PrepareForOfflineScreen />);

    fireEvent.press(screen.getByText('Luke'));

    await waitFor(() => {
      expect(screen.getByText('Assigned chapters (1)')).toBeTruthy();
    });
    expect(screen.getByText('Genesis')).toBeTruthy();
  });
});
