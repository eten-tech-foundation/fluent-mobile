import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { buildPrepareOfflineCatalog } from '../../utils/prepareOfflineCatalog';
import {
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
  setPrepareOfflineMockInventoryScenario,
} from '../../mocks/prepareOffline';
import { getPrepareOfflineResourceStatus } from '../../services/prepareOfflineResources';
import { PrepareOfflineResourcesSection } from './PrepareOfflineResourcesSection';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    ChevronDown: MockIcon,
    ChevronUp: MockIcon,
    SlidersHorizontal: MockIcon,
    CircleCheck: MockIcon,
    Download: MockIcon,
    Lock: MockIcon,
    Check: MockIcon,
    Loader2: MockIcon,
  };
});

const chapters = [
  {
    id: 1,
    bookId: 10,
    bookCode: 'GEN',
    bookName: 'Genesis',
    chapterNumber: 1,
    assignedUserId: 42,
  },
];

function buildSectionCatalog(projectId = 1) {
  return buildPrepareOfflineCatalog({
    manifest: MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
    getResourceStatus: (resourceId: string) =>
      getPrepareOfflineResourceStatus(projectId, resourceId),
    chapters,
    selectedIds: new Set([1]),
  });
}

describe('PrepareOfflineResourcesSection', () => {
  const catalog = buildSectionCatalog();

  const defaultProps = {
    catalog,
    isItemSelected: () => true,
    onToggleItem: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows tier 1 summary by default with customize collapsed', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    expect(screen.getByText('RESOURCES TO DOWNLOAD')).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-resource-summary')).toBeTruthy();
    expect(screen.getByTestId('resource-tier-1')).toBeTruthy();
    expect(screen.getByText('TIER 1 — REQUIRED')).toBeTruthy();
    expect(screen.getByText('Source Bible')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Words')).toBeNull();
    expect(screen.getByText('Customize download')).toBeTruthy();
    expect(screen.queryByTestId('resource-tier-2')).toBeNull();
    expect(screen.queryByTestId('prepare-offline-download-button')).toBeNull();
  });

  it('shows full-bleed dividers between tier 1 resource groups in the summary', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    const summary = screen.getByTestId('prepare-offline-resource-summary');
    const tier1Groups = catalog.groups.filter(
      group => group.items[0]?.tier === 1,
    );
    const dividers = within(summary).queryAllByTestId('resource-group-divider');

    expect(dividers.length).toBe(Math.max(0, tier1Groups.length - 1));
  });

  it('expands customize panel with tier 2 and 3 sections only', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    fireEvent.press(screen.getByText('Customize download'));

    const accordion = screen.getByTestId('customize-download-accordion');

    expect(screen.queryByTestId('resource-tier-1')).toBeTruthy();
    expect(screen.getByTestId('resource-tier-2')).toBeTruthy();
    expect(screen.getByTestId('resource-tier-3')).toBeTruthy();
    expect(within(accordion).getByText('Translation Words')).toBeTruthy();
    expect(within(accordion).getByText('Translation Questions')).toBeTruthy();
    expect(within(accordion).queryByText('Translation Notes')).toBeNull();
  });

  it('shows full-bleed dividers between resource groups in customize', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    fireEvent.press(screen.getByText('Customize download'));

    const accordion = screen.getByTestId('customize-download-accordion');
    const customizeGroups = catalog.groups.filter(
      group => (group.items[0]?.tier ?? 0) >= 2,
    );
    const dividers = within(accordion).getAllByTestId('resource-group-divider');

    expect(dividers.length).toBe(customizeGroups.length - 1);
  });

  it('always shows tier 1 in the summary regardless of deselect state', () => {
    render(
      <PrepareOfflineResourcesSection
        {...defaultProps}
        isItemSelected={itemId => !itemId.includes('tier-3')}
      />,
    );

    const summary = screen.getByTestId('prepare-offline-resource-summary');
    expect(within(summary).getByText('Source Bible')).toBeTruthy();
    expect(within(summary).getByText('Translation Notes')).toBeTruthy();
    expect(within(summary).queryByText('Translation Words')).toBeNull();
    expect(within(summary).queryByText('Reference Images')).toBeNull();
  });

  it('locks completed tier 2 items in customize instead of showing a toggle', () => {
    setPrepareOfflineMockInventoryScenario('tier1-tier2');

    const catalogWithInventory = buildSectionCatalog(1);

    render(
      <PrepareOfflineResourcesSection
        {...defaultProps}
        catalog={catalogWithInventory}
      />,
    );
    fireEvent.press(screen.getByText('Customize download'));

    const accordion = screen.getByTestId('customize-download-accordion');
    const wordsTextRow = within(accordion).getByTestId(
      'resource-row-tier-2-translation-words-text',
    );
    fireEvent.press(wordsTextRow);
    fireEvent.press(wordsTextRow);

    expect(defaultProps.onToggleItem).not.toHaveBeenCalled();
  });
});
