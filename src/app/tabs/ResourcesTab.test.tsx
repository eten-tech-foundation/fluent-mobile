import React from 'react';
import { Button, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ResourcesTab } from './ResourcesTab';
import {
  DraftingProvider,
  useDraftingContext,
} from '../context/DraftingContext';
import { RESOURCES_EMPTY_MESSAGE } from '../../constants/messages';
import { clearResourcesTabUiState } from '../../utils/resourcesTabUiState';
import { VerseData } from '../../types/db/types';

jest.mock('../../services/storage', () => ({
  getActiveUserId: () => '1',
  getUserIdSync: () => '1',
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
  });

  it('shows the empty message when the unit has no resources', () => {
    renderResources(3);
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows section stubs when the unit has resources', () => {
    renderResources(2);
    expect(screen.getByText('Mark 14:2')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
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
});
