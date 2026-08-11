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
import { setMockImagesMapsLoadFailure } from '../../mocks/resources/imagesMapsMock';

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
      <ResourcesTab chapterId={99} chapterName="Mark 14" />
    </DraftingProvider>,
  );
}

describe('ResourcesTab', () => {
  beforeEach(() => {
    clearResourcesTabUiState();
    setMockImagesMapsLoadFailure(false);
  });

  afterEach(() => {
    setMockImagesMapsLoadFailure(false);
  });

  it('shows the empty message when the unit has no resources', () => {
    renderResources(3);
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows Images & Maps at the bottom when items exist', () => {
    renderResources(2);
    expect(screen.getByText('Mark 14:2')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });

  it('hides Images & Maps when none are available for the unit', () => {
    renderResources(1);
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Images & Maps')).toBeNull();
  });

  it('updates immediately when the selected verse changes', () => {
    renderResources(2);
    expect(screen.getByText('Translation Notes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('select-verse-3'));
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Translation Notes')).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-1'));
    expect(screen.getByText('Mark 14:1')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('restores open accordion state when returning to a unit', () => {
    renderResources(2);

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );
    expect(
      screen.getByText('Content for this section will appear here.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('select-verse-1'));
    expect(
      screen.queryByText('Content for this section will appear here.'),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-2'));
    expect(
      screen.getByText('Content for this section will appear here.'),
    ).toBeTruthy();
  });

  it('keeps Images & Maps collapsed by default and shows items after expand', async () => {
    renderResources(2);

    expect(screen.queryByTestId('images-maps-list')).toBeNull();

    fireEvent.press(screen.getByTestId('resources-section-imagesMaps-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    });
    expect(screen.getByText('Jerusalem region map')).toBeTruthy();
  });

  it('keeps Notes and Questions visible when Images & Maps load fails', async () => {
    setMockImagesMapsLoadFailure(true);
    renderResources(2);

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();

    fireEvent.press(screen.getByTestId('resources-section-imagesMaps-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-error')).toBeTruthy();
    });

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();

    setMockImagesMapsLoadFailure(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('images-maps-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    });
  });
});
