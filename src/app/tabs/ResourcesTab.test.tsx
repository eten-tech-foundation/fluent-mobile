import React from 'react';
import { Button, View } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ResourcesTab } from './ResourcesTab';
import {
  DraftingProvider,
  useDraftingContext,
} from '../context/DraftingContext';
import { RESOURCES_EMPTY_MESSAGE } from '../../constants/messages';
import { clearResourcesTabUiState } from '../../utils/resourcesTabUiState';
import { VerseData } from '../../types/db/types';
import {
  clearMockPrepareOfflineRuntimeInventory,
  setPrepareOfflineMockInventoryScenario,
} from '../../mocks/prepareOffline';
import { getDownloadedResourcesByProject } from '../../db/downloadQueueRepository';
import { getMockTranslationNotes } from '../../mocks/resources/translationNotesMock';
import { getMockTranslationQuestions } from '../../mocks/resources/translationQuestionsMock';
import { getMockImagesMaps } from '../../mocks/resources/imagesMapsMock';
import { loadTranslationNotesForUnit } from '../../services/translationNotes';
import { loadTranslationQuestionsForUnit } from '../../services/translationQuestions';
import { loadImagesMapsForUnit } from '../../services/imagesMaps';

jest.mock('../../db/downloadQueueRepository', () => ({
  getDownloadedResourcesByProject: jest.fn(async () => []),
}));

jest.mock('react-native-gesture-handler', () => {
  const actualReact = jest.requireActual('react');
  const chainable = () => {
    const gesture: Record<string, unknown> = {};
    [
      'onUpdate',
      'onEnd',
      'onTouchesMove',
      'activeOffsetX',
      'failOffsetY',
      'manualActivation',
      'numberOfTaps',
    ].forEach(method => {
      gesture[method] = () => gesture;
    });
    return gesture;
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      actualReact.createElement(actualReact.Fragment, null, children),
    GestureHandlerRootView: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    }) =>
      actualReact.createElement(require('react-native').View, props, children),
    Gesture: {
      Pan: chainable,
      Pinch: chainable,
      Tap: chainable,
      Simultaneous: () => chainable(),
      Exclusive: () => chainable(),
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../services/translationQuestions', () => {
  const actual = jest.requireActual('../../services/translationQuestions');
  return {
    ...actual,
    loadTranslationQuestionsForUnit: jest.fn(),
  };
});

jest.mock('../../services/translationNotes', () => {
  const actual = jest.requireActual('../../services/translationNotes');
  return {
    ...actual,
    loadTranslationNotesForUnit: jest.fn(),
  };
});

jest.mock('../../services/imagesMaps', () => {
  const actual = jest.requireActual('../../services/imagesMaps');
  return {
    ...actual,
    loadImagesMapsForUnit: jest.fn(),
  };
});

const downloadedRows = getDownloadedResourcesByProject as jest.Mock;
const mockLoadNotes = loadTranslationNotesForUnit as jest.MockedFunction<
  typeof loadTranslationNotesForUnit
>;
const mockLoadQuestions =
  loadTranslationQuestionsForUnit as jest.MockedFunction<
    typeof loadTranslationQuestionsForUnit
  >;
const mockLoadImages = loadImagesMapsForUnit as jest.MockedFunction<
  typeof loadImagesMapsForUnit
>;

const verses: VerseData[] = [1, 2, 3].map(verseNumber => ({
  bibleId: 1,
  bookId: 41,
  chapterNumber: 14,
  verseNumber,
  text: `Text ${verseNumber}`,
}));

function VerseSwitcher() {
  const { selectedVerse, setSelectedVerse } = useDraftingContext();
  return (
    <View>
      <Button
        title={`current-${selectedVerse}`}
        testID="current-verse"
        onPress={() => undefined}
      />
      <Button
        title="select-1"
        testID="select-verse-1"
        onPress={() => setSelectedVerse(1)}
      />
      <Button
        title="select-2"
        testID="select-verse-2"
        onPress={() => setSelectedVerse(2)}
      />
      <Button
        title="select-3"
        testID="select-verse-3"
        onPress={() => setSelectedVerse(3)}
      />
    </View>
  );
}

function renderResources(
  initialVerse: number,
  projectId: number | null = 7,
  userId: number | null = 42,
) {
  return render(
    <DraftingProvider verses={verses} initialVerse={initialVerse}>
      <VerseSwitcher />
      <ResourcesTab
        chapterId={99}
        chapterName="Mark 14"
        projectId={projectId}
        userId={userId}
        bookCode="MRK"
        chapterNumber={14}
      />
    </DraftingProvider>,
  );
}

describe('ResourcesTab', () => {
  beforeEach(() => {
    clearResourcesTabUiState();
    clearMockPrepareOfflineRuntimeInventory();
    setPrepareOfflineMockInventoryScenario('fresh');
    downloadedRows.mockResolvedValue([]);
    mockLoadNotes.mockImplementation(async ({ verseNumber }) =>
      getMockTranslationNotes(99, verseNumber),
    );
    mockLoadQuestions.mockImplementation(async ({ verseNumber }) =>
      getMockTranslationQuestions(99, verseNumber),
    );
    mockLoadImages.mockImplementation(async ({ verseNumber }) =>
      getMockImagesMaps(99, verseNumber),
    );
  });

  afterEach(() => {
    mockLoadNotes.mockReset();
    mockLoadQuestions.mockReset();
    mockLoadImages.mockReset();
  });

  it('shows a section persisted as completed in download_queue', async () => {
    downloadedRows.mockResolvedValue([
      { status: 'completed', resourceName: 'Reference Images', kind: 'image' },
    ]);
    mockLoadImages.mockResolvedValue(getMockImagesMaps(99, 2));
    renderResources(1);

    await waitFor(() => {
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows the empty message when nothing is inventoried (fresh)', () => {
    renderResources(1);
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows empty when projectId is null', () => {
    setPrepareOfflineMockInventoryScenario('all');
    renderResources(1, null);
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
  });

  it('shows Translation Notes only for tier1 inventory', () => {
    setPrepareOfflineMockInventoryScenario('tier1');
    renderResources(2);
    expect(screen.getByText('Mark 14:2')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Questions')).toBeNull();
    expect(screen.queryByText('Images & Maps')).toBeNull();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });

  it('shows TN + TQ for tier1-tier2 inventory', () => {
    setPrepareOfflineMockInventoryScenario('tier1-tier2');
    renderResources(1);
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.queryByText('Images & Maps')).toBeNull();
  });

  it('shows all sections when all tiers are inventoried', async () => {
    setPrepareOfflineMockInventoryScenario('all');
    mockLoadImages.mockResolvedValue(getMockImagesMaps(99, 2));
    renderResources(3);
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });
  });

  it('updates the reference label when the selected verse changes', () => {
    setPrepareOfflineMockInventoryScenario('tier1');
    renderResources(1);
    expect(screen.getByText('Mark 14:1')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('select-verse-3'));
    expect(screen.getByText('Mark 14:3')).toBeTruthy();
    // Sections stay inventory-gated — not verse % 3 mocks.
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });

  it('restores open accordion state when returning to a unit', async () => {
    setPrepareOfflineMockInventoryScenario('all');
    mockLoadImages.mockResolvedValue(getMockImagesMaps(99, 2));
    renderResources(2);

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('select-verse-1'));
    expect(screen.queryByTestId('translation-notes-list')).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-2'));
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
  });

  it('gates sections from inventory without verse-mock emptiness', async () => {
    setPrepareOfflineMockInventoryScenario('all');
    mockLoadImages.mockResolvedValue(getMockImagesMaps(99, 2));
    renderResources(3);
    // Verse 3 used to mean empty under verse % 3 mocks; inventory wins.
    expect(screen.getByText('Mark 14:3')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });
});
