import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  usePrepareOfflineResources,
  UsePrepareOfflineResourcesInput,
} from './usePrepareOfflineResources';
import {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';
import {
  resetMockPrepareOfflineInventory,
  setMockPrepareOfflineResourceStatus,
  setPrepareOfflineMockInventoryScenario,
  getMockPrepareOfflineResourceStatus,
  DEV_MOCK_FILE_BYTES,
} from '../mocks/prepareOffline';
import { manifestEntryToResourceId } from '../utils/prepareOfflineResourceId';

const TIER3_MOCK_TOTAL =
  2 * DEV_MOCK_FILE_BYTES.text +
  2 * DEV_MOCK_FILE_BYTES.audio +
  DEV_MOCK_FILE_BYTES.image;

function chapter(id: number): PrepareOfflineChapterRow {
  return {
    id,
    bookId: 1,
    bookCode: 'GEN',
    bookName: 'Genesis',
    chapterNumber: id,
    assignedUserId: null,
    bibleId: 10,
  };
}

/**
 * Expands the static mock catalog into raw API-shaped manifest items (#504),
 * one per catalog entry, reusing catalog resource ids so mock inventory
 * lookups resolve.
 */
function buildManifestFixture(): PrepareOfflineResourceManifestItem[] {
  return [
    {
      id: manifestEntryToResourceId(1, 'Source Bible', 'text'),
      tier: 1,
      kind: 'text',
      resourceName: 'Source Bible',
      label: 'Text',
      required: true,
      removable: false,
      bytesTotal: DEV_MOCK_FILE_BYTES.text,
      fileExt: 'json',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(1, 'Source Bible', 'audio'),
      tier: 1,
      kind: 'audio',
      resourceName: 'Source Bible',
      label: 'Audio',
      required: true,
      removable: false,
      bytesTotal: DEV_MOCK_FILE_BYTES.audio,
      fileExt: 'mp3',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(1, 'Translation Notes', 'text'),
      tier: 1,
      kind: 'text',
      resourceName: 'Translation Notes',
      label: 'Text',
      required: true,
      removable: false,
      bytesTotal: DEV_MOCK_FILE_BYTES.text,
      fileExt: 'json',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(1, 'Translation Notes', 'audio'),
      tier: 1,
      kind: 'audio',
      resourceName: 'Translation Notes',
      label: 'Audio',
      required: true,
      removable: false,
      bytesTotal: DEV_MOCK_FILE_BYTES.audio,
      fileExt: 'mp3',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(2, 'Translation Words', 'text'),
      tier: 2,
      kind: 'text',
      resourceName: 'Translation Words',
      label: 'Text',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.text,
      fileExt: 'json',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(2, 'Translation Words', 'audio'),
      tier: 2,
      kind: 'audio',
      resourceName: 'Translation Words',
      label: 'Audio',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.audio,
      fileExt: 'mp3',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(2, 'Translation Questions', 'text'),
      tier: 2,
      kind: 'text',
      resourceName: 'Translation Questions',
      label: 'Text',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.text,
      fileExt: 'json',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(2, 'Translation Questions', 'audio'),
      tier: 2,
      kind: 'audio',
      resourceName: 'Translation Questions',
      label: 'Audio',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.audio,
      fileExt: 'mp3',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(3, 'Bible Commentary', 'text'),
      tier: 3,
      kind: 'text',
      resourceName: 'Bible Commentary',
      label: 'Text',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.text,
      fileExt: 'json',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(3, 'Bible Commentary', 'audio'),
      tier: 3,
      kind: 'audio',
      resourceName: 'Bible Commentary',
      label: 'Audio',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.audio,
      fileExt: 'mp3',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(3, 'Reference Images', 'image'),
      tier: 3,
      kind: 'image',
      resourceName: 'Reference Images',
      label: 'Image',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.image,
      fileExt: 'png',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(3, 'Alternate Translations', 'text'),
      tier: 3,
      kind: 'text',
      resourceName: 'Alternate Translations',
      label: 'Text',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.text,
      fileExt: 'json',
      languageCode: 'eng',
    },
    {
      id: manifestEntryToResourceId(3, 'Alternate Translations', 'audio'),
      tier: 3,
      kind: 'audio',
      resourceName: 'Alternate Translations',
      label: 'Audio',
      required: false,
      removable: true,
      bytesTotal: DEV_MOCK_FILE_BYTES.audio,
      fileExt: 'mp3',
      languageCode: 'eng',
    },
  ];
}

jest.mock('./usePrepareOfflineResourceData', () => ({
  usePrepareOfflineResourceData: jest.fn(() => {
    void usePrepareOfflineResourceDataState;
    return usePrepareOfflineResourceDataState.current;
  }),
}));

const usePrepareOfflineResourceDataState: { current: unknown } = {
  current: null,
};

function mockResourceData(overrides: Record<string, unknown> = {}) {
  usePrepareOfflineResourceDataState.current = {
    manifest: buildManifestFixture(),
    loading: false,
    error: null,
    inventoryVersion: 0,
    getResourceStatus: (resourceId: string) =>
      getMockPrepareOfflineResourceStatus(1, resourceId),
    clearSessionInventory: jest.fn(),
    getDefaultPackageDeselects: () => new Set<string>(),
    ...overrides,
  };
}

async function waitForCatalogItems(result: {
  current: ReturnType<typeof usePrepareOfflineResources>;
}) {
  await waitFor(() => {
    expect(result.current.catalog.items.length).toBeGreaterThan(0);
  });
}

function baseInput(
  overrides: Partial<UsePrepareOfflineResourcesInput> = {},
): UsePrepareOfflineResourcesInput {
  return {
    projectId: 1,
    userId: 42,
    chapters: [chapter(1)],
    selectedIds: new Set([1]),
    selectedCount: 1,
    isAssignedUser: true,
    ...overrides,
  };
}

describe('usePrepareOfflineResources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockPrepareOfflineInventory();
    setPrepareOfflineMockInventoryScenario('fresh');
    mockResourceData();
  });

  it('disables download for unassigned users with no chapter selection', () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources(
        baseInput({ selectedIds: new Set<number>(), selectedCount: 0 }),
      ),
    );

    expect(result.current.canDownload).toBe(false);
    expect(result.current.catalog.items).toHaveLength(0);
  });

  it('enables download for assigned users when catalog is valid', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources(baseInput()),
    );

    await waitForCatalogItems(result);

    expect(result.current.canDownload).toBe(true);
    expect(result.current.pendingBytes).toBeGreaterThan(0);
    expect(result.current.selectedItems.length).toBeGreaterThan(0);
  });

  it('enables download for unassigned users after selecting a chapter', async () => {
    const { result, rerender } = renderHook(
      (props: UsePrepareOfflineResourcesInput) =>
        usePrepareOfflineResources(props),
      {
        initialProps: baseInput({
          selectedIds: new Set<number>(),
          selectedCount: 0,
          isAssignedUser: false,
        }),
      },
    );

    expect(result.current.canDownload).toBe(false);

    rerender(baseInput({ isAssignedUser: false }));

    await waitForCatalogItems(result);

    expect(result.current.canDownload).toBe(true);
  });

  it('updates pending bytes when tier 2/3 rows are deselected', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources(baseInput({ projectId: 99 })),
    );

    await waitForCatalogItems(result);

    const initialPending = result.current.pendingBytes;
    const initialTotal = result.current.totalBytes;

    act(() => {
      result.current.toggleItemSelected('Translation Questions:text');
    });

    expect(result.current.pendingBytes).toBe(
      initialPending - DEV_MOCK_FILE_BYTES.text,
    );
    expect(result.current.totalBytes).toBe(
      initialTotal - DEV_MOCK_FILE_BYTES.text,
    );
  });

  it('resets deselected items when project changes', async () => {
    const { result, rerender } = renderHook(
      (props: UsePrepareOfflineResourcesInput) =>
        usePrepareOfflineResources(props),
      { initialProps: baseInput() },
    );

    await waitForCatalogItems(result);

    act(() => {
      result.current.toggleItemSelected('Bible Commentary:text');
    });

    expect(result.current.isItemSelected('Bible Commentary:text')).toBe(false);

    rerender(baseInput({ projectId: 2 }));

    await waitForCatalogItems(result);

    expect(result.current.isItemSelected('Bible Commentary:text')).toBe(true);
  });

  it('resets deselected items when account changes on the same project', async () => {
    const { result, rerender } = renderHook(
      (props: UsePrepareOfflineResourcesInput) =>
        usePrepareOfflineResources(props),
      { initialProps: baseInput() },
    );

    await waitForCatalogItems(result);

    act(() => {
      result.current.toggleItemSelected('Bible Commentary:text');
    });

    expect(result.current.isItemSelected('Bible Commentary:text')).toBe(false);

    rerender(baseInput({ userId: 99 }));

    await waitForCatalogItems(result);

    expect(result.current.isItemSelected('Bible Commentary:text')).toBe(true);
  });

  it('preserves completed inventory after Prepare Offline remount', async () => {
    setPrepareOfflineMockInventoryScenario('fresh');
    const notesId = manifestEntryToResourceId(1, 'Translation Notes', 'text');

    const { result, unmount } = renderHook(() =>
      usePrepareOfflineResources(baseInput({ projectId: 374 })),
    );

    await waitForCatalogItems(result);

    act(() => {
      setMockPrepareOfflineResourceStatus(374, notesId, 'completed');
    });

    expect(getMockPrepareOfflineResourceStatus(374, notesId)).toBe('completed');

    unmount();

    const remounted = renderHook(() =>
      usePrepareOfflineResources(baseInput({ projectId: 374 })),
    );

    await waitForCatalogItems(remounted.result);

    expect(getMockPrepareOfflineResourceStatus(374, notesId)).toBe('completed');
    remounted.unmount();
  });

  it('includes every tier in the package by default (#504 — no scenario deselects)', async () => {
    setPrepareOfflineMockInventoryScenario('tier1-tier2');

    const { result } = renderHook(() =>
      usePrepareOfflineResources(baseInput({ projectId: 88 })),
    );

    await waitForCatalogItems(result);

    // All tiers checked by default now, including tier 3.
    expect(result.current.isItemSelected('Bible Commentary:text')).toBe(true);
    expect(
      result.current.effectiveCatalog.groups.some(
        group => group.groupName === 'Bible Commentary',
      ),
    ).toBe(true);
    expect(result.current.pendingBytes).toBe(TIER3_MOCK_TOTAL);
  });

  it('keeps tier 1 rows locked and tier 2/3 rows toggleable in customize', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources(baseInput()),
    );

    await waitForCatalogItems(result);

    const tier1Id = 'Source Bible:text';
    const tier2Id = 'Translation Words:text';

    // Tier 1 is locked — toggling must not change selection.
    act(() => {
      result.current.toggleItemSelected(tier1Id);
    });
    expect(result.current.isItemSelected(tier1Id)).toBe(true);

    // Tier 2 toggles freely.
    act(() => {
      result.current.toggleItemSelected(tier2Id);
    });
    expect(result.current.isItemSelected(tier2Id)).toBe(false);

    act(() => {
      result.current.toggleItemSelected(tier2Id);
    });
    expect(result.current.isItemSelected(tier2Id)).toBe(true);
  });
});
