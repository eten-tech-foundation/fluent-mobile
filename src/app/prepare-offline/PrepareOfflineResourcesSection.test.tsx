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
    summaryCatalog: catalog,
    isItemSelected: () => true,
    onToggleItem: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows summary by default with customize collapsed', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    expect(screen.getByText('RESOURCES TO DOWNLOAD')).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-resource-summary')).toBeTruthy();
    expect(screen.getByText('Customize download')).toBeTruthy();
    expect(screen.queryByTestId('resource-tier-2')).toBeNull();
    expect(screen.queryByTestId('prepare-offline-download-button')).toBeNull();
  });

  it('shows full-bleed dividers between resource groups in the summary', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    const summary = screen.getByTestId('prepare-offline-resource-summary');
    const dividers = within(summary).getAllByTestId('resource-group-divider');

    expect(dividers.length).toBe(catalog.groups.length - 1);
  });

  it('expands customize panel with tier sections', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    fireEvent.press(screen.getByText('Customize download'));

    expect(screen.getByTestId('resource-tier-1')).toBeTruthy();
    expect(screen.getByTestId('resource-tier-2')).toBeTruthy();
    expect(screen.getByTestId('resource-tier-3')).toBeTruthy();
    expect(screen.getByText('TIER 1 — REQUIRED')).toBeTruthy();
  });

  it('shows full-bleed dividers between resource groups in customize', () => {
    render(<PrepareOfflineResourcesSection {...defaultProps} />);

    fireEvent.press(screen.getByText('Customize download'));

    const accordion = screen.getByTestId('customize-download-accordion');
    const dividers = within(accordion).getAllByTestId('resource-group-divider');

    expect(dividers.length).toBe(catalog.groups.length - 1);
  });

  it('hides deselected groups from the read-only summary', () => {
    const summaryCatalog = buildSectionCatalog();
    const tier1Only = {
      ...summaryCatalog,
      items: summaryCatalog.items.filter(item => item.tier === 1),
      groups: summaryCatalog.groups.filter(
        group => group.groupName === 'Source Bible',
      ),
    };

    render(
      <PrepareOfflineResourcesSection
        {...defaultProps}
        summaryCatalog={tier1Only}
      />,
    );

    expect(screen.getByText('Source Bible')).toBeTruthy();
    expect(screen.queryByText('Translation Words')).toBeNull();
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('updates the summary live while customize is expanded', () => {
    const tier1Only = {
      ...catalog,
      items: catalog.items.filter(item => item.tier === 1),
      groups: catalog.groups.filter(
        group => group.groupName === 'Source Bible',
      ),
    };

    const { rerender } = render(
      <PrepareOfflineResourcesSection
        {...defaultProps}
        summaryCatalog={tier1Only}
      />,
    );

    fireEvent.press(screen.getByText('Customize download'));

    rerender(
      <PrepareOfflineResourcesSection
        {...defaultProps}
        summaryCatalog={catalog}
      />,
    );

    const summary = screen.getByTestId('prepare-offline-resource-summary');
    expect(within(summary).getByText('Reference images')).toBeTruthy();
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
