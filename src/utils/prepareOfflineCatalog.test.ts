import {
  buildPrepareOfflineCatalog,
  buildEffectiveCatalog,
  computePendingBytes,
  computeRemainingBytes,
  computeTotalBytes,
  computeManifestBytesForScope,
  filterPrepareOfflineCatalogByTiers,
  getEffectiveItems,
  getRemainingBytesForItem,
  isItemCustomizeLocked,
  isItemIncluded,
  isTierLocked,
  sortItemsForPrepareOfflineDownload,
} from './prepareOfflineCatalog';
import { scopedPrepareOfflineResourceId } from './prepareOfflineResourceId';
import {
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
  DEV_MOCK_FILE_BYTES,
  resetMockPrepareOfflineInventory,
  setPrepareOfflineMockInventoryScenario,
} from '../mocks/prepareOffline';
import { getPrepareOfflineResourceStatus } from '../services/prepareOfflineResources';
import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

const MB = 1024 * 1024;

const ONE_CHAPTER_MOCK_TOTAL =
  6 * DEV_MOCK_FILE_BYTES.text +
  6 * DEV_MOCK_FILE_BYTES.audio +
  DEV_MOCK_FILE_BYTES.image;

const TIER1_ONE_CHAPTER_TOTAL =
  2 * DEV_MOCK_FILE_BYTES.text + 2 * DEV_MOCK_FILE_BYTES.audio;

function chapter(id: number): PrepareOfflineChapterRow {
  return {
    id,
    bookId: 1,
    bookCode: 'GEN',
    bookName: 'Genesis',
    chapterNumber: id,
    assignedUserId: null,
  };
}

function buildTestCatalog(options: {
  chapters: PrepareOfflineChapterRow[];
  selectedIds: Set<number>;
  projectId?: number;
}) {
  const projectId = options.projectId ?? 1;

  return buildPrepareOfflineCatalog({
    projectId,
    manifest: MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
    getResourceStatus: (resourceId: string) =>
      getPrepareOfflineResourceStatus(projectId, resourceId),
    chapters: options.chapters,
    selectedIds: options.selectedIds,
  });
}

function catalogResourceId(
  projectId: number,
  tier: 1 | 2 | 3,
  groupName: string,
  kind: 'text' | 'audio' | 'image',
): string {
  return scopedPrepareOfflineResourceId(projectId, tier, groupName, kind);
}

const PID = 1;

describe('prepareOfflineCatalog', () => {
  const chapters = [chapter(1), chapter(2)];

  beforeEach(() => {
    resetMockPrepareOfflineInventory();
  });

  it('returns empty catalog when no chapters are selected', () => {
    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set(),
    });

    expect(catalog.items).toEqual([]);
    expect(catalog.groups).toEqual([]);
  });

  it('builds tier 1/2/3 items grouped by resource name', () => {
    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });

    expect(catalog.items.length).toBeGreaterThan(0);
    expect(catalog.groups.map(g => g.groupName)).toEqual([
      'Source Bible',
      'Translation Notes',
      'Translation Words',
      'Translation Questions',
      'Bible Commentary',
      'Reference Images',
      'Alternate Translations',
    ]);

    const tier1 = catalog.items.filter(item => item.tier === 1);
    expect(tier1).toHaveLength(4);
    expect(tier1.map(item => item.groupName).sort()).toEqual([
      'Source Bible',
      'Source Bible',
      'Translation Notes',
      'Translation Notes',
    ]);
  });

  it('filterPrepareOfflineCatalogByTiers keeps only matching tiers', () => {
    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });

    const tier1Only = filterPrepareOfflineCatalogByTiers(catalog, [1]);
    expect(tier1Only.items.every(item => item.tier === 1)).toBe(true);
    expect(tier1Only.groups.map(group => group.groupName)).toEqual([
      'Source Bible',
      'Translation Notes',
    ]);

    const customize = filterPrepareOfflineCatalogByTiers(catalog, [2, 3]);
    expect(customize.items.every(item => item.tier >= 2)).toBe(true);
    expect(customize.groups.map(group => group.groupName)).toEqual([
      'Translation Words',
      'Translation Questions',
      'Bible Commentary',
      'Reference Images',
      'Alternate Translations',
    ]);
  });

  it('locks tier 1 from deselection', () => {
    expect(isTierLocked(1)).toBe(true);
    expect(isTierLocked(2)).toBe(false);
    expect(isTierLocked(3)).toBe(false);
  });

  it('locks completed but not downloading items from customize toggles', () => {
    const completedItem = {
      id: catalogResourceId(PID, 2, 'Translation Words', 'text'),
      tier: 2 as const,
      kind: 'text' as const,
      groupName: 'Translation Words',
      label: 'Text',
      bytes: 10 * MB,
      status: 'completed' as const,
    };
    const pendingItem = { ...completedItem, status: 'selected' as const };
    const downloadingItem = {
      ...completedItem,
      status: 'downloading' as const,
    };

    expect(isItemCustomizeLocked(completedItem)).toBe(true);
    expect(isItemCustomizeLocked(downloadingItem)).toBe(false);
    expect(isItemCustomizeLocked(pendingItem)).toBe(false);
  });

  it('allows deselecting a downloading item from the effective download set', () => {
    const downloadingItem = {
      id: catalogResourceId(PID, 2, 'Translation Words', 'audio'),
      tier: 2 as const,
      kind: 'audio' as const,
      groupName: 'Translation Words',
      label: 'Audio',
      bytes: 32 * MB,
      status: 'downloading' as const,
    };

    expect(isItemIncluded(downloadingItem, new Set([downloadingItem.id]))).toBe(
      false,
    );
  });

  it('always includes locked items in the effective download set', () => {
    const completedItem = {
      id: catalogResourceId(PID, 2, 'Translation Words', 'text'),
      tier: 2 as const,
      kind: 'text' as const,
      groupName: 'Translation Words',
      label: 'Text',
      bytes: 10 * MB,
      status: 'completed' as const,
    };

    expect(isItemIncluded(completedItem, new Set([completedItem.id]))).toBe(
      true,
    );
  });

  it('computes total bytes for the effective download set', () => {
    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });

    const total = computeTotalBytes(catalog, new Set());

    expect(total).toBe(ONE_CHAPTER_MOCK_TOTAL);
  });

  it('subtracts deselected tier 2/3 items from totals', () => {
    setPrepareOfflineMockInventoryScenario('fresh');

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });
    const questionsTextId = catalogResourceId(
      PID,
      2,
      'Translation Questions',
      'text',
    );

    const deselected = new Set([questionsTextId]);
    const withoutQuestionsText = computeTotalBytes(catalog, deselected);

    expect(withoutQuestionsText).toBe(
      computeTotalBytes(catalog, new Set()) - DEV_MOCK_FILE_BYTES.text,
    );
    expect(isItemIncluded(catalog.items[0], deselected)).toBe(true);
    expect(
      isItemIncluded(
        catalog.items.find(item => item.id === questionsTextId)!,
        deselected,
      ),
    ).toBe(false);
  });

  it('computes pending bytes excluding completed items only', () => {
    setPrepareOfflineMockInventoryScenario('mixed');

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });

    const pending = computePendingBytes(catalog, new Set());
    const completedBytes =
      3 * DEV_MOCK_FILE_BYTES.text + 2 * DEV_MOCK_FILE_BYTES.audio;
    const allBytes = computeTotalBytes(catalog, new Set());

    expect(pending).toBe(allBytes - completedBytes);
  });

  it('reduces pending bytes when tier 2/3 items are deselected', () => {
    setPrepareOfflineMockInventoryScenario('mixed');

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });
    const questionsAudioId = catalogResourceId(
      PID,
      2,
      'Translation Questions',
      'audio',
    );

    const pendingAll = computePendingBytes(catalog, new Set());
    const pendingDeselected = computePendingBytes(
      catalog,
      new Set([questionsAudioId]),
    );

    expect(pendingDeselected).toBe(pendingAll - DEV_MOCK_FILE_BYTES.audio);
    expect(
      getEffectiveItems(catalog, new Set([questionsAudioId])),
    ).toHaveLength(catalog.items.length - 1);
  });

  it('computeRemainingBytes uses full catalog bytes for non-completed items', () => {
    const remaining = computeRemainingBytes([
      {
        id: catalogResourceId(PID, 1, 'Source Bible', 'text'),
        tier: 1,
        kind: 'text',
        groupName: 'Source Bible',
        label: 'Text',
        bytes: 100,
        status: 'downloading',
        progress: 0.25,
      },
      {
        id: catalogResourceId(PID, 1, 'Source Bible', 'audio'),
        tier: 1,
        kind: 'audio',
        groupName: 'Source Bible',
        label: 'Audio',
        bytes: 200,
        status: 'selected',
      },
    ]);

    expect(remaining).toBe(100 + 200);
  });

  it('getRemainingBytesForItem returns zero for completed rows', () => {
    expect(
      getRemainingBytesForItem({
        id: catalogResourceId(PID, 3, 'Bible Commentary', 'text'),
        tier: 3,
        kind: 'text',
        groupName: 'Bible Commentary',
        label: 'Text',
        bytes: 12 * 1024 * 1024,
        status: 'completed',
      }),
    ).toBe(0);
  });

  it('getRemainingBytesForItem returns full catalog bytes for non-completed rows', () => {
    expect(
      getRemainingBytesForItem({
        id: catalogResourceId(PID, 3, 'Bible Commentary', 'audio'),
        tier: 3,
        kind: 'audio',
        groupName: 'Bible Commentary',
        label: 'Audio',
        bytes: 24 * 1024 * 1024,
        status: 'selected',
        progress: 0.5,
      }),
    ).toBe(24 * 1024 * 1024);
  });

  it('buildEffectiveCatalog omits deselected tier 2/3 from summary groups', () => {
    setPrepareOfflineMockInventoryScenario('tier1');

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });
    const deselected = new Set([
      catalogResourceId(PID, 2, 'Translation Words', 'text'),
      catalogResourceId(PID, 2, 'Translation Words', 'audio'),
      catalogResourceId(PID, 2, 'Translation Questions', 'text'),
      catalogResourceId(PID, 2, 'Translation Questions', 'audio'),
      catalogResourceId(PID, 3, 'Bible Commentary', 'text'),
      catalogResourceId(PID, 3, 'Bible Commentary', 'audio'),
      catalogResourceId(PID, 3, 'Reference Images', 'image'),
      catalogResourceId(PID, 3, 'Alternate Translations', 'text'),
      catalogResourceId(PID, 3, 'Alternate Translations', 'audio'),
    ]);

    const effective = buildEffectiveCatalog(catalog, deselected);

    expect(effective.groups.map(group => group.groupName)).toEqual([
      'Source Bible',
      'Translation Notes',
    ]);
    expect(effective.items).toHaveLength(4);
    expect(computeTotalBytes(effective, new Set())).toBe(
      TIER1_ONE_CHAPTER_TOTAL,
    );
    expect(computePendingBytes(effective, new Set())).toBe(0);
  });

  it('scales chapter-scoped manifest bytes with selected chapter count', () => {
    const oneChapter = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });
    const twoChapters = buildTestCatalog({
      chapters,
      selectedIds: new Set([1, 2]),
    });

    const notesTextOne = oneChapter.items.find(
      item =>
        item.id === catalogResourceId(PID, 1, 'Translation Notes', 'text'),
    )!;
    const notesTextTwo = twoChapters.items.find(
      item =>
        item.id === catalogResourceId(PID, 1, 'Translation Notes', 'text'),
    )!;
    const wordsTextOne = oneChapter.items.find(
      item =>
        item.id === catalogResourceId(PID, 2, 'Translation Words', 'text'),
    )!;
    const wordsTextTwo = twoChapters.items.find(
      item =>
        item.id === catalogResourceId(PID, 2, 'Translation Words', 'text'),
    )!;

    expect(notesTextOne.bytes).toBe(DEV_MOCK_FILE_BYTES.text);
    expect(notesTextTwo.bytes).toBe(2 * DEV_MOCK_FILE_BYTES.text);
    expect(wordsTextOne.bytes).toBe(DEV_MOCK_FILE_BYTES.text);
    expect(wordsTextTwo.bytes).toBe(DEV_MOCK_FILE_BYTES.text);
  });

  it('computeManifestBytesForScope applies chapter, book, and project rules', () => {
    expect(computeManifestBytesForScope('chapter', 18 * MB, 2, 1)).toBe(
      36 * MB,
    );
    expect(computeManifestBytesForScope('book', 8 * MB, 3, 2)).toBe(16 * MB);
    expect(computeManifestBytesForScope('project', 10 * MB, 5, 3)).toBe(
      10 * MB,
    );
  });

  it('sortItemsForPrepareOfflineDownload follows manifest order not alphabetical', () => {
    const catalog = buildTestCatalog({
      chapters: [chapter(1)],
      selectedIds: new Set([1]),
    });
    const shuffled = [...catalog.items].reverse();
    const sorted = sortItemsForPrepareOfflineDownload(shuffled, catalog.items);

    expect(sorted.map(item => item.id)).toEqual(
      catalog.items.map(item => item.id),
    );
    expect(sorted[0].groupName).toBe('Source Bible');
    expect(sorted[0].kind).toBe('text');
    expect(sorted[2].groupName).toBe('Translation Notes');
    expect(sorted[4].groupName).toBe('Translation Words');
    expect(sorted[6].groupName).toBe('Translation Questions');
  });
});
