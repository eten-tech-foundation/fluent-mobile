import React from 'react';
import { Button, View } from 'react-native';
import {
  act,
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
import { getMockTranslationQuestions } from '../../mocks/resources/translationQuestionsMock';
import {
  loadTranslationQuestionsForUnit,
  setTranslationQuestionsLoadFailureForTests,
} from '../../services/translationQuestions';
import {
  loadTranslationNotesForUnit,
  setTranslationNotesLoadFailureForTests,
} from '../../services/translationNotes';
import { getMockTranslationNotes } from '../../mocks/resources/translationNotesMock';
import {
  loadImagesMapsForUnit,
  setImagesMapsLoadFailureForTests,
} from '../../services/imagesMaps';
import { getMockImagesMaps } from '../../mocks/resources/imagesMapsMock';

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

function renderResources(initialVerse: number) {
  return render(
    <DraftingProvider verses={verses} initialVerse={initialVerse}>
      <VerseSwitcher />
      <ResourcesTab
        chapterId={99}
        chapterName="Mark 14"
        bookCode="MRK"
        chapterNumber={14}
      />
    </DraftingProvider>,
  );
}

/** Wait until in-flight Images & Maps loads have applied to React state. */
async function waitForImagesMapsSettled(minCalls = 1) {
  await waitFor(() => {
    expect(mockLoadImages.mock.calls.length).toBeGreaterThanOrEqual(minCalls);
  });
  await act(async () => {
    await Promise.all(
      mockLoadImages.mock.results
        .filter(result => result.type === 'return')
        .map(result =>
          Promise.resolve(result.value as Promise<unknown>).catch(
            () => undefined,
          ),
        ),
    );
  });
}

describe('ResourcesTab', () => {
  beforeEach(() => {
    clearResourcesTabUiState();
    setTranslationQuestionsLoadFailureForTests(false);
    setTranslationNotesLoadFailureForTests(false);
    setImagesMapsLoadFailureForTests(false);
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
    setTranslationQuestionsLoadFailureForTests(false);
    setTranslationNotesLoadFailureForTests(false);
    setImagesMapsLoadFailureForTests(false);
    mockLoadNotes.mockReset();
    mockLoadQuestions.mockReset();
    mockLoadImages.mockReset();
  });

  it('shows the empty message when the unit has no resources', async () => {
    mockLoadNotes.mockResolvedValue([]);
    mockLoadImages.mockResolvedValue([]);
    renderResources(3);
    await waitFor(() => {
      expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows live Translation Notes even when mock shell is empty', async () => {
    mockLoadNotes.mockResolvedValue(getMockTranslationNotes(99, 1));
    mockLoadImages.mockResolvedValue([]);
    renderResources(3);

    await waitFor(() => {
      expect(screen.getByText('Translation Notes')).toBeTruthy();
    });
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('shows Translation Notes and Questions when items exist', async () => {
    renderResources(2);
    await waitForImagesMapsSettled();
    expect(screen.getByText('Mark 14:2')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();

    const notes = screen.getByTestId('resources-section-translationNotes');
    const questions = screen.getByTestId(
      'resources-section-translationQuestions',
    );
    expect(notes).toBeTruthy();
    expect(questions).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
    expect(screen.getByText('connecting word')).toBeTruthy();
  });

  it('hides Translation Questions when none are available for the unit', async () => {
    renderResources(1);
    await waitForImagesMapsSettled();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('hides Translation Notes when Aquifer returns no notes', async () => {
    mockLoadNotes.mockResolvedValue([]);
    mockLoadImages.mockResolvedValue([]);
    renderResources(1);

    await waitFor(() => {
      expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    });
    expect(
      screen.queryByTestId('resources-section-translationNotes'),
    ).toBeNull();
  });

  it('hides Images & Maps after Aquifer returns no items for the unit', async () => {
    mockLoadImages.mockImplementation(async () => []);
    renderResources(2);

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();

    await waitForImagesMapsSettled();
    expect(screen.queryByTestId('resources-section-imagesMaps')).toBeNull();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
  });

  it('keeps Images & Maps visible while loading, then shows items', async () => {
    let resolveLoad!: (
      items: Awaited<ReturnType<typeof loadImagesMapsForUnit>>,
    ) => void;
    mockLoadImages.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveLoad = resolve;
        }),
    );

    renderResources(2);

    expect(screen.getByText('Images & Maps')).toBeTruthy();

    await act(async () => {
      resolveLoad(getMockImagesMaps(99, 2));
    });

    fireEvent.press(screen.getByTestId('resources-section-imagesMaps-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    });
  });

  it('updates when the selected verse changes', async () => {
    renderResources(2);
    await waitForImagesMapsSettled(1);
    expect(screen.getByText('Translation Notes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('select-verse-3'));
    await waitFor(() => {
      expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText('Translation Notes')).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-1'));
    await waitFor(() => {
      expect(screen.getByText('Mark 14:1')).toBeTruthy();
      expect(screen.getByText('Translation Notes')).toBeTruthy();
    });
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('restores open accordion state when returning to a unit', async () => {
    renderResources(2);

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('select-verse-1'));
    await waitFor(() => {
      expect(screen.getByText('Mark 14:1')).toBeTruthy();
    });
    expect(screen.queryByTestId('translation-notes-list')).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-2'));
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
  });

  it('keeps Questions and Images visible when Notes load fails', async () => {
    mockLoadNotes.mockRejectedValue(new Error('boom'));
    renderResources(2);

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-error')).toBeTruthy();
    });

    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();

    mockLoadNotes.mockResolvedValue(getMockTranslationNotes(99, 2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('translation-notes-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
  });

  it('keeps TQ collapsed by default and reveals questions only after expand', async () => {
    renderResources(2);

    expect(screen.queryByTestId('translation-questions-list')).toBeNull();

    fireEvent.press(
      screen.getByTestId('resources-section-translationQuestions-toggle'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });
    expect(screen.getByText('What is happening in this verse?')).toBeTruthy();
    expect(
      screen.queryByText(
        'The passage describes the events surrounding this verse so the translator can check key meaning.',
      ),
    ).toBeNull();
  });

  it('keeps Images & Maps collapsed by default and shows items after expand', async () => {
    renderResources(2);
    await waitForImagesMapsSettled();

    expect(screen.queryByTestId('images-maps-list')).toBeNull();

    fireEvent.press(screen.getByTestId('resources-section-imagesMaps-toggle'));

    expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    expect(screen.getByText('Jerusalem region map')).toBeTruthy();
  });

  it('keeps Notes and Images visible when TQ load fails', async () => {
    mockLoadQuestions.mockRejectedValue(new Error('boom'));
    renderResources(2);

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('resources-section-translationQuestions-toggle'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-error')).toBeTruthy();
    });

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();

    mockLoadQuestions.mockResolvedValue(getMockTranslationQuestions(99, 2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('translation-questions-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });
  });

  it('keeps Notes and Questions visible when Images & Maps load fails', async () => {
    mockLoadImages.mockImplementation(async () => {
      throw new Error('boom');
    });
    renderResources(2);

    await waitFor(() => {
      expect(screen.getByText('Images & Maps')).toBeTruthy();
    });

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();

    fireEvent.press(screen.getByTestId('resources-section-imagesMaps-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-error')).toBeTruthy();
    });

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();

    mockLoadImages.mockImplementation(async () => getMockImagesMaps(99, 2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('images-maps-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    });
  });
});
