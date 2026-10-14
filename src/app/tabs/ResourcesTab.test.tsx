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
import {
  RESOURCES_EMPTY_MESSAGE,
  RESOURCES_NONE_FOR_VERSE_MESSAGE,
} from '../../constants/messages';
import { clearResourcesTabUiState } from '../../utils/resourcesTabUiState';
import { VerseData } from '../../types/db/types';
import { getDownloadedResourcesByProject } from '../../db/downloadQueueRepository';
import { TranslationNoteItem } from '../../types/resources/translationNotes';
import { TranslationQuestionItem } from '../../types/resources/translationQuestions';
import { ImagesMapsItem } from '../../types/resources/imagesMaps';
import { loadTranslationNotesForUnit } from '../../services/translationNotes';
import { loadTranslationQuestionsForUnit } from '../../services/translationQuestions';
import { loadImagesMapsForUnit } from '../../services/imagesMaps';
import { useConnectivity } from '../../hooks/useConnectivity';
import { RESOURCES_SECTION_INVENTORY_GATES } from '../../utils/resourcesSectionInventory';
import { ResourceSectionId } from '../../types/resources/types';
import { PrepareOfflineResourceStatus } from '../../types/prepareOffline/types';

jest.mock('../../db/downloadQueueRepository', () => ({
  getDownloadedResourcesByProject: jest.fn(async () => []),
}));

/**
 * Mock the Prepare Offline service boundary (consumed by resourcesInventory
 * and the inventory hooks): statuses come from a controllable map instead of
 * the deleted dev mock runtime (#504).
 */
const mockInventoryStatusMap = new Map<string, PrepareOfflineResourceStatus>();

jest.mock('../../services/prepareOfflineResources', () => ({
  getPrepareOfflineResourceStatus: jest.fn(
    (_projectId: number, _userId: number, resourceId: string) =>
      mockInventoryStatusMap.get(resourceId) ?? 'available',
  ),
  subscribePrepareOfflineInventory: jest.fn(() => jest.fn()),
  refreshPrepareOfflineInventory: jest.fn(async () => undefined),
  clearPrepareOfflineSessionInventory: jest.fn(),
  getDefaultPrepareOfflinePackageDeselects: jest.fn(() => new Set<string>()),
}));

function markSectionsCompleted(sectionIds: ResourceSectionId[]) {
  mockInventoryStatusMap.clear();
  for (const gate of RESOURCES_SECTION_INVENTORY_GATES) {
    if (sectionIds.includes(gate.sectionId)) {
      mockInventoryStatusMap.set(gate.resourceId, 'completed');
    }
  }
}

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

jest.mock('../../hooks/useConnectivity', () => ({
  useConnectivity: jest.fn(() => ({
    isOnline: true,
    isLinkOnline: true,
    isWifi: true,
    isCellular: false,
    connectionType: 'wifi',
    hasResolved: true,
    hasTransferResolved: true,
    connectivityPending: false,
    transferConnectivityPending: false,
  })),
}));

type BibleTabUnitsMock = {
  draftingUnit: 'verse' | 'pericope';
  effectiveUnit: 'verse' | 'pericope';
  unitsPending: boolean;
  units: Array<{
    key: string;
    draftingUnit: 'verse' | 'pericope';
    verses: Array<{ chapterNumber: number; verseNumber: number }>;
    title: string;
    anchorVerse: number;
    previewText: string;
    bodyVerses: never[];
    recordedStatus: 'none';
  }>;
  activeIndex: number;
  unitCaption: string;
  lastUnrecorded: null;
  boundaryVerses: number[];
  refreshCoverages: jest.Mock;
};

const mockUseBibleTabUnits = jest.fn(
  ({ selectedVerse }: { selectedVerse: number }): BibleTabUnitsMock => ({
    draftingUnit: 'verse',
    effectiveUnit: 'verse',
    unitsPending: false,
    units: [
      {
        key: `verse:${selectedVerse}`,
        draftingUnit: 'verse',
        verses: [{ chapterNumber: 14, verseNumber: selectedVerse }],
        title: `Mark 14:${selectedVerse}`,
        anchorVerse: selectedVerse,
        previewText: '',
        bodyVerses: [],
        recordedStatus: 'none',
      },
    ],
    activeIndex: 0,
    unitCaption: `Verse ${selectedVerse} / 3`,
    lastUnrecorded: null,
    boundaryVerses: [],
    refreshCoverages: jest.fn(),
  }),
);

jest.mock('../../hooks/useBibleTabUnits', () => ({
  useBibleTabUnits: (args: { selectedVerse: number }) =>
    mockUseBibleTabUnits(args),
}));

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
const mockUseConnectivity = useConnectivity as jest.MockedFunction<
  typeof useConnectivity
>;

jest.mock('../../services/storage', () => ({
  getActiveUserId: () => '1',
  getUserIdSync: () => '1',
}));

// Fixed fixtures for this suite — mirrors the old `verse % 3` mock-resource
// pattern (translationNotesMock / translationQuestionsMock / imagesMapsMock)
// but inlined, so this test has no dependency on `mocks/resources`.
function notesForVerse(verseNumber: number): TranslationNoteItem[] {
  if (verseNumber % 3 === 0) {
    return [];
  }
  return [
    {
      id: `tn-99-${verseNumber}-1`,
      title: 'connecting word',
      body: 'This phrase connects the current verse to the previous one.',
    },
    {
      id: `tn-99-${verseNumber}-2`,
      title: 'Important name',
      body: 'Translate this name consistently with earlier uses in the book.',
    },
  ];
}

function questionsForVerse(verseNumber: number): TranslationQuestionItem[] {
  if (verseNumber % 3 !== 2) {
    return [];
  }
  return [
    {
      id: `tq-99-${verseNumber}-1`,
      question: 'What is happening in this verse?',
      answer:
        'The passage describes the events surrounding this verse so the translator can check key meaning.',
    },
  ];
}

function imagesForVerse(verseNumber: number): ImagesMapsItem[] {
  if (verseNumber % 3 !== 2) {
    return [];
  }
  return [
    {
      id: `img-99-${verseNumber}-1`,
      title: 'Jerusalem region map',
      caption: 'Overview of surrounding towns',
      attribution: 'Aquifer / Bible Journey Maps',
      uri: `https://picsum.photos/seed/fluent-map-99-${verseNumber}/800/500`,
    },
  ];
}

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
        bibleId={1}
        bookId={41}
      />
    </DraftingProvider>,
  );
}

function mockOfflineConnectivity() {
  mockUseConnectivity.mockReturnValue({
    isOnline: false,
    isLinkOnline: false,
    isWifi: false,
    isCellular: false,
    connectionType: 'none',
    hasResolved: true,
    hasTransferResolved: true,
    connectivityPending: false,
    transferConnectivityPending: false,
  });
}

describe('ResourcesTab', () => {
  beforeEach(() => {
    clearResourcesTabUiState();
    mockInventoryStatusMap.clear();
    markSectionsCompleted([]);
    downloadedRows.mockResolvedValue([]);
    mockUseBibleTabUnits.mockImplementation(
      ({ selectedVerse }: { selectedVerse: number }): BibleTabUnitsMock => ({
        draftingUnit: 'verse',
        effectiveUnit: 'verse',
        unitsPending: false,
        units: [
          {
            key: `verse:${selectedVerse}`,
            draftingUnit: 'verse',
            verses: [{ chapterNumber: 14, verseNumber: selectedVerse }],
            title: `Mark 14:${selectedVerse}`,
            anchorVerse: selectedVerse,
            previewText: '',
            bodyVerses: [],
            recordedStatus: 'none',
          },
        ],
        activeIndex: 0,
        unitCaption: `Verse ${selectedVerse} / 3`,
        lastUnrecorded: null,
        boundaryVerses: [],
        refreshCoverages: jest.fn(),
      }),
    );
    mockUseConnectivity.mockReturnValue({
      isOnline: true,
      isLinkOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
      hasResolved: true,
      hasTransferResolved: true,
      connectivityPending: false,
      transferConnectivityPending: false,
    });
    mockLoadNotes.mockImplementation(async ({ verseNumber }) =>
      notesForVerse(verseNumber),
    );
    mockLoadQuestions.mockImplementation(async ({ verseNumber }) =>
      questionsForVerse(verseNumber),
    );
    mockLoadImages.mockImplementation(async ({ verseNumber }) =>
      imagesForVerse(verseNumber),
    );
  });

  afterEach(() => {
    mockLoadNotes.mockReset();
    mockLoadQuestions.mockReset();
    mockLoadImages.mockReset();
  });

  it('shows a section persisted as completed in download_queue', async () => {
    mockOfflineConnectivity();
    downloadedRows.mockResolvedValue([
      { status: 'completed', resourceName: 'Reference Images', kind: 'image' },
    ]);
    mockLoadImages.mockResolvedValue(imagesForVerse(2));
    renderResources(1);

    await waitFor(() => {
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows non-empty sections online when nothing is inventoried (fresh)', async () => {
    renderResources(1);
    // Verse 1 mock: TN only; TQ + Images hide after empty load (#591).
    await waitFor(() => {
      expect(screen.getByText('Translation Notes')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText('Translation Questions')).toBeNull();
      expect(screen.queryByText('Images & Maps')).toBeNull();
    });
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(RESOURCES_NONE_FOR_VERSE_MESSAGE)).toBeNull();
  });

  it('loads Translation Questions with the tab, not on expand', async () => {
    renderResources(2);
    await waitFor(() => {
      expect(mockLoadQuestions).toHaveBeenCalled();
    });
    expect(
      mockLoadQuestions.mock.calls.some(([params]) => params.verseNumber === 2),
    ).toBe(true);
    // Section still collapsed — load must not wait on expand.
    expect(
      screen.queryByTestId('resources-section-translationQuestions-toggle'),
    ).toBeTruthy();
  });

  it('hides Translation Notes when the unit loads empty online', async () => {
    mockLoadNotes.mockImplementation(async () => []);
    mockLoadQuestions.mockImplementation(async () => questionsForVerse(2));
    mockLoadImages.mockImplementation(async () => imagesForVerse(2));
    renderResources(2);

    await waitFor(() => {
      expect(mockLoadNotes).toHaveBeenCalled();
      expect(mockLoadQuestions).toHaveBeenCalled();
      expect(mockLoadImages).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('Translation Questions')).toBeTruthy();
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText('Translation Notes')).toBeNull();
    });
  });

  it('hides Translation Questions when the unit loads empty online', async () => {
    // Default verse-1 mocks already return empty TQ + Images; assert hide-when-empty.
    renderResources(1);

    await waitFor(() => {
      expect(screen.getByText('Translation Notes')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText('Translation Questions')).toBeNull();
      expect(screen.queryByText('Images & Maps')).toBeNull();
    });
  });

  it('shows the online empty message when every section loads empty', async () => {
    renderResources(3);
    await waitFor(() => {
      expect(screen.getByText(RESOURCES_NONE_FOR_VERSE_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText('Translation Notes')).toBeNull();
    expect(screen.queryByText('Translation Questions')).toBeNull();
    expect(screen.queryByText('Images & Maps')).toBeNull();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });

  it('shows the empty message offline when nothing is inventoried (fresh)', () => {
    mockOfflineConnectivity();
    renderResources(1);
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows a loading indicator while connectivity is unresolved', () => {
    mockUseConnectivity.mockReturnValue({
      isOnline: true,
      isLinkOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
      hasResolved: false,
      hasTransferResolved: false,
      connectivityPending: true,
      transferConnectivityPending: true,
    });
    renderResources(1);
    expect(screen.getByTestId('resources-tab-loading')).toBeTruthy();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(RESOURCES_NONE_FOR_VERSE_MESSAGE)).toBeNull();
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows empty when projectId is null', () => {
    markSectionsCompleted([
      'translationNotes',
      'translationQuestions',
      'imagesMaps',
    ]);
    renderResources(1, null);
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
  });

  it('shows Translation Notes only for tier1 inventory offline', () => {
    mockOfflineConnectivity();
    markSectionsCompleted(['translationNotes']);
    renderResources(2);
    expect(screen.getByText('Mark 14:2')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Questions')).toBeNull();
    expect(screen.queryByText('Images & Maps')).toBeNull();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });

  it('shows TN + TQ for tier1-tier2 inventory offline', async () => {
    mockOfflineConnectivity();
    markSectionsCompleted(['translationNotes', 'translationQuestions']);
    // Verse 2 mocks have TN + TQ content; empty sections hide after load (#591).
    renderResources(2);
    await waitFor(() => {
      expect(screen.getByText('Translation Notes')).toBeTruthy();
      expect(screen.getByText('Translation Questions')).toBeTruthy();
    });
    expect(screen.queryByText('Images & Maps')).toBeNull();
  });

  it('shows all sections when all tiers are inventoried', async () => {
    markSectionsCompleted([
      'translationNotes',
      'translationQuestions',
      'imagesMaps',
    ]);
    mockLoadImages.mockResolvedValue(imagesForVerse(2));
    // Verse 2 mocks have TN + TQ + Images content.
    renderResources(2);
    await waitFor(() => {
      expect(screen.getByText('Translation Notes')).toBeTruthy();
      expect(screen.getByText('Translation Questions')).toBeTruthy();
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });
  });

  it('updates the reference label when the selected verse changes', async () => {
    markSectionsCompleted(['translationNotes']);
    renderResources(1);
    expect(screen.getByText('Mark 14:1')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Translation Notes')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('select-verse-3'));
    expect(screen.getByText('Mark 14:3')).toBeTruthy();
    // Verse 3 mocks are empty — online tab-wide empty (#591).
    await waitFor(() => {
      expect(screen.getByText(RESOURCES_NONE_FOR_VERSE_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });

  it('restores open accordion state when returning to a unit', async () => {
    markSectionsCompleted([
      'translationNotes',
      'translationQuestions',
      'imagesMaps',
    ]);
    mockLoadImages.mockResolvedValue(imagesForVerse(2));
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

  it('gates sections from offline inventory without verse-mock emptiness', async () => {
    mockOfflineConnectivity();
    markSectionsCompleted([
      'translationNotes',
      'translationQuestions',
      'imagesMaps',
    ]);
    mockLoadImages.mockResolvedValue(imagesForVerse(2));
    renderResources(3);
    // Verse 3 used to mean empty under verse % 3 mocks; inventory wins.
    expect(screen.getByText('Mark 14:3')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });

  it('keeps chapter:verse header in verse mode when unit title is bare (#593)', () => {
    mockUseBibleTabUnits.mockImplementation(
      ({ selectedVerse }: { selectedVerse: number }): BibleTabUnitsMock => ({
        draftingUnit: 'verse',
        effectiveUnit: 'verse',
        unitsPending: false,
        units: [
          {
            key: `verse:${selectedVerse}`,
            draftingUnit: 'verse',
            verses: [{ chapterNumber: 14, verseNumber: selectedVerse }],
            // Real buildBibleUnits verse title is just the number.
            title: String(selectedVerse),
            anchorVerse: selectedVerse,
            previewText: '',
            bodyVerses: [],
            recordedStatus: 'none',
          },
        ],
        activeIndex: 0,
        unitCaption: `Verse ${selectedVerse} / 3`,
        lastUnrecorded: null,
        boundaryVerses: [],
        refreshCoverages: jest.fn(),
      }),
    );
    markSectionsCompleted(['translationNotes']);
    renderResources(2);
    expect(screen.getByText('Mark 14:2')).toBeTruthy();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('shows pericope range and fans out verseRefs (#593)', async () => {
    mockUseBibleTabUnits.mockImplementation(
      (): BibleTabUnitsMock => ({
        draftingUnit: 'pericope',
        effectiveUnit: 'pericope',
        unitsPending: false,
        units: [
          {
            key: 'pericope:1',
            draftingUnit: 'pericope',
            verses: [
              { chapterNumber: 14, verseNumber: 1 },
              { chapterNumber: 14, verseNumber: 2 },
              { chapterNumber: 14, verseNumber: 3 },
            ],
            title: 'Mark 14:1–3',
            anchorVerse: 1,
            previewText: '',
            bodyVerses: [],
            recordedStatus: 'none',
          },
        ],
        activeIndex: 0,
        unitCaption: 'Pericope 1 / 1',
        lastUnrecorded: null,
        boundaryVerses: [2, 3],
        refreshCoverages: jest.fn(),
      }),
    );
    markSectionsCompleted(['translationNotes']);
    renderResources(1);

    expect(screen.getByText('Mark 14:1–3')).toBeTruthy();
    expect(screen.getByTestId('resources-unit-99-pericope:1')).toBeTruthy();

    await waitFor(() => {
      expect(mockLoadNotes).toHaveBeenCalledWith(
        expect.objectContaining({
          verseNumber: 1,
          verseRefs: [
            { chapterNumber: 14, verseNumber: 1 },
            { chapterNumber: 14, verseNumber: 2 },
            { chapterNumber: 14, verseNumber: 3 },
          ],
        }),
      );
    });
  });
});
