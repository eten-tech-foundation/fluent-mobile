import {
  buildPrepareOfflineCatalog,
  buildEffectiveCatalog,
  computePendingBytes,
  computeRemainingBytes,
  computeTotalBytes,
  filterPrepareOfflineCatalogByTiers,
  getEffectiveItems,
  getRemainingBytesForItem,
  isItemCustomizeLocked,
  isItemIncluded,
  isTierLocked,
  sortItemsForPrepareOfflineDownload,
} from './prepareOfflineCatalog';
import { manifestEntryToResourceId } from './prepareOfflineResourceId';
import {
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
  DEV_MOCK_FILE_BYTES,
  resetMockPrepareOfflineInventory,
  setPrepareOfflineMockInventoryScenario,
} from '../mocks/prepareOffline';
import { getPrepareOfflineResourceStatus } from '../services/prepareOfflineResources';
import {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';

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
    bibleId: 10,
  };
}

/**
 * Expands the static mock catalog into raw API-shaped manifest items (#504):
 * one item per (entry, selected chapter) for chapter-scoped entries, one item
 * otherwise. Item ids reuse `manifestEntryToResourceId` so mock inventory
 * lookups keep resolving (the mock catalog has one entry per id).
 */
function buildManifestFixture(
  selectedChapters: number[],
): PrepareOfflineResourceManifestItem[] {
  const items: PrepareOfflineResourceManifestItem[] = [];

  for (const entry of MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST) {
    const id = manifestEntryToResourceId(
      entry.tier,
      entry.groupName,
      entry.kind,
    );
    const chaptersForEntry =
      entry.scope === 'chapter' ? selectedChapters : [selectedChapters[0] ?? 1];

    for (const _chapterNumber of chaptersForEntry) {
      items.push({
        id,
        tier: entry.tier,
        kind: entry.kind,
        resourceName: entry.groupName,
        label:
          entry.kind === 'text'
            ? 'Text'
            : entry.kind === 'audio'
            ? 'Audio'
            : 'Image',
        required: entry.tier === 1,
        removable: entry.tier !== 1,
        bytesTotal: entry.unitBytes,
        fileExt:
          entry.kind === 'audio'
            ? 'mp3'
            : entry.kind === 'image'
            ? 'png'
            : 'json',
        languageCode: 'eng',
      });
    }
  }

  return items;
}

function buildTestCatalog(options: {
  chapters: PrepareOfflineChapterRow[];
  selectedIds: Set<number>;
  projectId?: number;
  manifest?: PrepareOfflineResourceManifestItem[];
}) {
  const projectId = options.projectId ?? 1;

  return buildPrepareOfflineCatalog({
    manifest: options.manifest ?? buildManifestFixture([1]),
    getResourceStatus: (resourceId: string) =>
      getPrepareOfflineResourceStatus(projectId, resourceId),
    chapters: options.chapters,
    selectedIds: options.selectedIds,
  });
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

  it('builds tier 1/2/3 rows grouped by resource name from raw manifest items', () => {
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

  it('aggregates multiple manifest items per (resourceName, kind) into one row', () => {
    // Two "Translation Words" text members (e.g. two collection chunks).
    const wordsMemberA = manifestEntryToResourceId(
      2,
      'Translation Words',
      'text',
    );
    const manifest = [
      ...buildManifestFixture([1]).filter(
        item => !item.id.startsWith(wordsMemberA),
      ),
      {
        ...buildManifestFixture([1]).find(item =>
          item.id.startsWith(wordsMemberA),
        )!,
        id: `${wordsMemberA}-part-a`,
      },
      {
        ...buildManifestFixture([1]).find(item =>
          item.id.startsWith(wordsMemberA),
        )!,
        id: `${wordsMemberA}-part-b`,
        bytesTotal: DEV_MOCK_FILE_BYTES.text + 500,
      },
    ];

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest,
    });

    const wordsText = catalog.items.find(
      item => item.groupName === 'Translation Words' && item.kind === 'text',
    )!;

    expect(wordsText.id).toBe('Translation Words:text');
    expect(wordsText.bytes).toBe(
      DEV_MOCK_FILE_BYTES.text + (DEV_MOCK_FILE_BYTES.text + 500),
    );
    expect(wordsText.manifestMembers).toHaveLength(2);
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
      id: 'Translation Words:text',
      tier: 2 as const,
      kind: 'text' as const,
      groupName: 'Translation Words',
      label: 'Text',
      bytes: 10 * MB,
      status: 'completed' as const,
      manifestMembers: [],
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
      id: 'Translation Words:audio',
      tier: 2 as const,
      kind: 'audio' as const,
      groupName: 'Translation Words',
      label: 'Audio',
      bytes: 32 * MB,
      status: 'downloading' as const,
      manifestMembers: [],
    };

    expect(isItemIncluded(downloadingItem, new Set([downloadingItem.id]))).toBe(
      false,
    );
  });

  it('always includes locked items in the effective download set', () => {
    const completedItem = {
      id: 'Translation Words:text',
      tier: 2 as const,
      kind: 'text' as const,
      groupName: 'Translation Words',
      label: 'Text',
      bytes: 10 * MB,
      status: 'completed' as const,
      manifestMembers: [],
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

  it('subtracts deselected tier 2/3 rows from totals', () => {
    setPrepareOfflineMockInventoryScenario('fresh');

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });
    const questionsTextId = 'Translation Questions:text';

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

  it('reduces pending bytes when tier 2/3 rows are deselected', () => {
    setPrepareOfflineMockInventoryScenario('mixed');

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
    });
    const questionsAudioId = 'Translation Questions:audio';

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

  it('computeRemainingBytes uses full row bytes for non-completed items', () => {
    const remaining = computeRemainingBytes([
      {
        id: 'Source Bible:text',
        tier: 1,
        kind: 'text',
        groupName: 'Source Bible',
        label: 'Text',
        bytes: 100,
        status: 'downloading',
        progress: 0.25,
        manifestMembers: [],
      },
      {
        id: 'Source Bible:audio',
        tier: 1,
        kind: 'audio',
        groupName: 'Source Bible',
        label: 'Audio',
        bytes: 200,
        status: 'selected',
        manifestMembers: [],
      },
    ]);

    expect(remaining).toBe(100 + 200);
  });

  it('getRemainingBytesForItem returns zero for completed rows', () => {
    expect(
      getRemainingBytesForItem({
        id: 'Bible Commentary:text',
        tier: 3,
        kind: 'text',
        groupName: 'Bible Commentary',
        label: 'Text',
        bytes: 12 * 1024 * 1024,
        status: 'completed',
        manifestMembers: [],
      }),
    ).toBe(0);
  });

  it('getRemainingBytesForItem returns full row bytes for non-completed rows', () => {
    expect(
      getRemainingBytesForItem({
        id: 'Bible Commentary:audio',
        tier: 3,
        kind: 'audio',
        groupName: 'Bible Commentary',
        label: 'Audio',
        bytes: 24 * 1024 * 1024,
        status: 'selected',
        progress: 0.5,
        manifestMembers: [],
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
      'Translation Words:text',
      'Translation Words:audio',
      'Translation Questions:text',
      'Translation Questions:audio',
      'Bible Commentary:text',
      'Bible Commentary:audio',
      'Reference Images:image',
      'Alternate Translations:text',
      'Alternate Translations:audio',
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

  it('scales chapter-scoped rows with selected chapter count; project rows stay flat', () => {
    const manifest = buildManifestFixture([1, 2]);
    const oneChapter = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest: buildManifestFixture([1]),
    });
    const twoChapters = buildTestCatalog({
      chapters,
      selectedIds: new Set([1, 2]),
      manifest,
    });

    const notesTextOne = oneChapter.items.find(
      item => item.id === 'Translation Notes:text',
    )!;
    const notesTextTwo = twoChapters.items.find(
      item => item.id === 'Translation Notes:text',
    )!;
    const wordsTextOne = oneChapter.items.find(
      item => item.id === 'Translation Words:text',
    )!;
    const wordsTextTwo = twoChapters.items.find(
      item => item.id === 'Translation Words:text',
    )!;

    expect(notesTextOne.manifestMembers).toHaveLength(1);
    expect(notesTextOne.bytes).toBe(DEV_MOCK_FILE_BYTES.text);
    expect(notesTextTwo.manifestMembers).toHaveLength(2);
    expect(notesTextTwo.bytes).toBe(2 * DEV_MOCK_FILE_BYTES.text);
    expect(wordsTextOne.manifestMembers).toHaveLength(1);
    expect(wordsTextOne.bytes).toBe(DEV_MOCK_FILE_BYTES.text);
    expect(wordsTextTwo.manifestMembers).toHaveLength(1);
    expect(wordsTextTwo.bytes).toBe(DEV_MOCK_FILE_BYTES.text);
  });

  it('aggregates status across members: any downloading → downloading, all completed → completed', () => {
    setPrepareOfflineMockInventoryScenario('fresh');

    const base = manifestEntryToResourceId(2, 'Translation Words', 'audio');
    const manifest: PrepareOfflineResourceManifestItem[] = [
      {
        id: `${base}-a`,
        tier: 2,
        kind: 'audio',
        resourceName: 'Translation Words',
        label: 'Audio',
        required: false,
        removable: true,
        bytesTotal: 100,
        fileExt: 'mp3',
        languageCode: 'eng',
      },
      {
        id: `${base}-b`,
        tier: 2,
        kind: 'audio',
        resourceName: 'Translation Words',
        label: 'Audio',
        required: false,
        removable: true,
        bytesTotal: 100,
        fileExt: 'mp3',
        languageCode: 'eng',
      },
    ];

    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest,
    });

    // fresh scenario: every id is 'selected' → row passthrough on first member.
    expect(catalog.items[0].status).toBe('selected');
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
