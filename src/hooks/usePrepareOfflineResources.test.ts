import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  usePrepareOfflineResources,
  UsePrepareOfflineResourcesInput,
} from './usePrepareOfflineResources';
import {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';

const TEXT_BYTES = 1_000;
const AUDIO_BYTES = 2_000;
const IMAGE_BYTES = 4_000;

const TOTAL_ALL_BYTES = 6 * TEXT_BYTES + 6 * AUDIO_BYTES + IMAGE_BYTES;

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

function manifestItem(
  tier: 1 | 2 | 3,
  resourceName: string,
  kind: 'text' | 'audio' | 'image',
): PrepareOfflineResourceManifestItem {
  return {
    id: `tier-${tier}-${resourceName
      .toLowerCase()
      .replace(/\s+/g, '-')}-${kind}`,
    tier,
    kind,
    resourceName,
    label: kind === 'text' ? 'Text' : kind === 'audio' ? 'Audio' : 'Image',
    required: tier === 1,
    removable: tier !== 1,
    bytesTotal:
      kind === 'audio'
        ? AUDIO_BYTES
        : kind === 'image'
        ? IMAGE_BYTES
        : TEXT_BYTES,
    fileExt: kind === 'audio' ? 'mp3' : kind === 'image' ? 'png' : 'json',
    languageCode: 'eng',
  };
}

/**
 * Inline manifest fixture replacing the deleted dev mock catalog (#504):
 * full tier 1/2/3 shape with per-resource text + audio rows.
 */
function buildManifestFixture(): PrepareOfflineResourceManifestItem[] {
  return [
    manifestItem(1, 'Source Bible', 'text'),
    manifestItem(1, 'Source Bible', 'audio'),
    manifestItem(1, 'Translation Notes', 'text'),
    manifestItem(1, 'Translation Notes', 'audio'),
    manifestItem(2, 'Translation Words', 'text'),
    manifestItem(2, 'Translation Words', 'audio'),
    manifestItem(2, 'Translation Questions', 'text'),
    manifestItem(2, 'Translation Questions', 'audio'),
    manifestItem(3, 'Bible Commentary', 'text'),
    manifestItem(3, 'Bible Commentary', 'audio'),
    manifestItem(3, 'Reference Images', 'image'),
    manifestItem(3, 'Alternate Translations', 'text'),
    manifestItem(3, 'Alternate Translations', 'audio'),
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

/**
 * Mutable per-project status map standing in for the real download_queue
 * status cache — tests flip entries directly, as the worker would.
 */
const statusMapByProject = new Map<
  number,
  Map<string, PrepareOfflineResourceStatus>
>();

function setResourceStatus(
  projectId: number,
  resourceId: string,
  status: PrepareOfflineResourceStatus,
) {
  let map = statusMapByProject.get(projectId);
  if (!map) {
    map = new Map();
    statusMapByProject.set(projectId, map);
  }
  map.set(resourceId, status);
}

function mockResourceData(overrides: Record<string, unknown> = {}) {
  usePrepareOfflineResourceDataState.current = {
    manifest: buildManifestFixture(),
    loading: false,
    error: null,
    inventoryVersion: 0,
    getResourceStatus: (resourceId: string) =>
      statusMapByProject.get(1)?.get(resourceId) ?? 'available',
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
    statusMapByProject.clear();
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
      usePrepareOfflineResources(baseInput()),
    );

    await waitForCatalogItems(result);

    const initialPending = result.current.pendingBytes;
    const initialTotal = result.current.totalBytes;

    act(() => {
      result.current.toggleItemSelected('Translation Questions:text');
    });

    expect(result.current.pendingBytes).toBe(initialPending - TEXT_BYTES);
    expect(result.current.totalBytes).toBe(initialTotal - TEXT_BYTES);
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

  it('canDownload is false when every row is already completed', async () => {
    const notesTextId = 'tier-1-translation-notes-text';
    mockResourceData({
      getResourceStatus: () => 'completed',
    });

    const { result } = renderHook(() =>
      usePrepareOfflineResources(baseInput({ projectId: 374 })),
    );

    await waitForCatalogItems(result);

    expect(result.current.pendingBytes).toBe(0);
    expect(result.current.canDownload).toBe(false);
    void notesTextId;
  });

  it('includes every tier in the package by default (#504 — no scenario deselects)', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources(baseInput()),
    );

    await waitForCatalogItems(result);

    // All tiers checked by default now, including tier 3.
    expect(result.current.isItemSelected('Bible Commentary:text')).toBe(true);
    expect(
      result.current.effectiveCatalog.groups.some(
        group => group.groupName === 'Bible Commentary',
      ),
    ).toBe(true);
    expect(result.current.pendingBytes).toBe(TOTAL_ALL_BYTES);
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

  it('locks completed tier 2 rows in customize instead of showing a toggle', async () => {
    setResourceStatus(1, 'tier-2-translation-words-text', 'completed');
    const { result } = renderHook(() =>
      usePrepareOfflineResources(baseInput()),
    );

    await waitForCatalogItems(result);

    act(() => {
      result.current.toggleItemSelected('Translation Words:text');
    });

    expect(result.current.isItemSelected('Translation Words:text')).toBe(true);
  });
});
