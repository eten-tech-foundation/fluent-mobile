import { Alert, type AlertButton } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useRecordingRecovery } from './useRecordingRecovery';
import { DraftingTab } from '../../../types/drafting/types';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockFindPausedTake = jest.fn();
const mockClearPausedTake = jest.fn();
jest.mock('../../../services/storage', () => ({
  findPausedTake: () => mockFindPausedTake(),
  clearPausedTake: (id: number) => mockClearPausedTake(id),
}));

const mockGetNav = jest.fn();
jest.mock('../../../db/queries', () => ({
  getVerseDetailNavByChapterAssignment: (id: number) => mockGetNav(id),
}));

const mockDeleteRecordingFile = jest.fn();
jest.mock('../../../services/recordingStorage', () => ({
  deleteRecordingFile: (uri: string) => mockDeleteRecordingFile(uri),
}));

const mockSetLastActiveTab = jest.fn();
jest.mock('../../../utils/draftingTabState', () => ({
  setLastActiveTab: (chapterId: number, tab: unknown) =>
    mockSetLastActiveTab(chapterId, tab),
}));

const marker = {
  bibleTextId: 42,
  segments: ['file:///docs/seg-0.aac', 'file:///docs/seg-1.aac'],
  elapsedMs: 4500,
  startedAt: '2026-07-01T00:00:00.000Z',
  chapterAssignmentId: 88,
  verseNumber: 5,
};

const navParams = {
  chapterId: 88,
  chapterName: 'Genesis 1',
  projectName: 'Demo Project',
  language: 'Swahili',
};

function findButton(text: string): AlertButton {
  const buttons = (Alert.alert as jest.Mock).mock.calls[0]![2] as AlertButton[];
  const button = buttons.find(b => b.text === text);
  if (!button) throw new Error(`No "${text}" button in Alert`);
  return button;
}

describe('useRecordingRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFindPausedTake.mockReturnValue(null);
    mockGetNav.mockResolvedValue(navParams);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing while disabled', () => {
    mockFindPausedTake.mockReturnValue(marker);
    renderHook(() => useRecordingRecovery(false));
    expect(mockFindPausedTake).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not prompt when there is no recovered take', () => {
    renderHook(() => useRecordingRecovery(true));
    expect(mockFindPausedTake).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('prompts with the resolved verse reference', async () => {
    mockFindPausedTake.mockReturnValue(marker);
    renderHook(() => useRecordingRecovery(true));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(mockGetNav).toHaveBeenCalledWith(88);
    const [, message] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(message).toContain('Genesis 1:5');
  });

  it('navigates to the recovered verse and opens the Record tab on Continue', async () => {
    mockFindPausedTake.mockReturnValue(marker);
    renderHook(() => useRecordingRecovery(true));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    findButton('Continue').onPress?.();

    expect(mockSetLastActiveTab).toHaveBeenCalledWith(88, DraftingTab.Record);
    expect(mockNavigate).toHaveBeenCalledWith('VerseDetail', {
      chapterId: 88,
      chapterName: 'Genesis 1',
      projectName: 'Demo Project',
      language: 'Swahili',
      recoverVerse: 5,
    });
  });

  it('unlinks segments and clears the marker on Discard', async () => {
    mockFindPausedTake.mockReturnValue(marker);
    renderHook(() => useRecordingRecovery(true));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    findButton('Discard').onPress?.();

    expect(mockDeleteRecordingFile).toHaveBeenCalledWith(
      'file:///docs/seg-0.aac',
    );
    expect(mockDeleteRecordingFile).toHaveBeenCalledWith(
      'file:///docs/seg-1.aac',
    );
    expect(mockClearPausedTake).toHaveBeenCalledWith(42);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not prompt when the take cannot be resolved to a verse', async () => {
    mockFindPausedTake.mockReturnValue({
      ...marker,
      chapterAssignmentId: undefined,
    });
    renderHook(() => useRecordingRecovery(true));

    await waitFor(() => expect(mockFindPausedTake).toHaveBeenCalledTimes(1));
    expect(mockGetNav).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
