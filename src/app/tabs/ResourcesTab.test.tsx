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

jest.mock('../../db/downloadQueueRepository', () => ({
  getDownloadedResourcesByProject: jest.fn(async () => []),
}));

const downloadedRows = getDownloadedResourcesByProject as jest.Mock;

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

function renderResources(initialVerse: number, projectId: number | null = 7) {
  return render(
    <DraftingProvider verses={verses} initialVerse={initialVerse}>
      <VerseSwitcher />
      <ResourcesTab
        chapterId={99}
        chapterName="Mark 14"
        projectId={projectId}
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
  });

  it('shows a section persisted as completed in download_queue', async () => {
    downloadedRows.mockResolvedValue([
      { status: 'completed', resourceName: 'Reference Images', kind: 'text' },
    ]);
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

  it('shows all sections when all tiers are inventoried', () => {
    setPrepareOfflineMockInventoryScenario('all');
    renderResources(3);
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
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

  it('restores open accordion state when returning to a unit', () => {
    setPrepareOfflineMockInventoryScenario('all');
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

  it('gates sections from inventory without verse-mock emptiness', () => {
    setPrepareOfflineMockInventoryScenario('all');
    renderResources(3);
    // Verse 3 used to mean empty under verse % 3 mocks; inventory wins.
    expect(screen.getByText('Mark 14:3')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
  });
});
