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
import {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';

const MB = 1024 * 1024;

const TEXT_BYTES = 1_000;
const AUDIO_BYTES = 2_000;

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
  overrides: Partial<PrepareOfflineResourceManifestItem> & {
    tier: 1 | 2 | 3;
    resourceName: string;
    kind: 'text' | 'audio' | 'image';
  },
): PrepareOfflineResourceManifestItem {
  const { tier, resourceName, kind, ...rest } = overrides;
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
    bytesTotal: kind === 'audio' ? AUDIO_BYTES : TEXT_BYTES,
    fileExt: kind === 'audio' ? 'mp3' : 'json',
    languageCode: 'eng',
    ...rest,
  };
}

/**
 * Inline manifest fixture replacing the deleted dev mock catalog (#504):
 * mirrors the real service shape — Tier 1 Source Bible text + audio and
 * Translation Notes text + audio (tier overridden mobile-side), Tier 2
 * Words/Questions, Tier 3 Commentary — with a uniform stubbed status fn.
 */
function buildManifestFixture(): PrepareOfflineResourceManifestItem[] {
  return [
    manifestItem({
      tier: 1,
      resourceName: 'Source Bible',
      kind: 'text',
      id: 'source-bible-text-GEN-1',
    }),
    manifestItem({
      tier: 1,
      resourceName: 'Source Bible',
      kind: 'audio',
      id: 'source-bible-audio-GEN-1',
    }),
    manifestItem({ tier: 1, resourceName: 'Translation Notes', kind: 'text' }),
    manifestItem({ tier: 1, resourceName: 'Translation Notes', kind: 'audio' }),
    manifestItem({ tier: 2, resourceName: 'Translation Words', kind: 'text' }),
    manifestItem({ tier: 2, resourceName: 'Translation Words', kind: 'audio' }),
    manifestItem({
      tier: 2,
      resourceName: 'Translation Questions',
      kind: 'text',
    }),
    manifestItem({
      tier: 2,
      resourceName: 'Translation Questions',
      kind: 'audio',
    }),
    manifestItem({ tier: 3, resourceName: 'Bible Commentary', kind: 'text' }),
    manifestItem({ tier: 3, resourceName: 'Bible Commentary', kind: 'audio' }),
  ];
}

function buildTestCatalog(options: {
  chapters: PrepareOfflineChapterRow[];
  selectedIds: Set<number>;
  manifest?: PrepareOfflineResourceManifestItem[];
  getResourceStatus?: (resourceId: string) => PrepareOfflineResourceStatus;
}) {
  return buildPrepareOfflineCatalog({
    manifest: options.manifest ?? buildManifestFixture(),
    getResourceStatus: options.getResourceStatus ?? (() => 'selected'),
    chapters: options.chapters,
    selectedIds: options.selectedIds,
  });
}

describe('prepareOfflineCatalog', () => {
  const chapters = [chapter(1), chapter(2)];

  it('returns empty catalog when no chapters are selected', () => {
    const catalog = buildTestCatalog({ chapters, selectedIds: new Set() });

    expect(catalog.items).toEqual([]);
    expect(catalog.groups).toEqual([]);
  });

  it('builds tier 1/2/3 rows grouped by resource name from raw manifest items', () => {
    const catalog = buildTestCatalog({ chapters, selectedIds: new Set([1]) });

    expect(catalog.items.length).toBeGreaterThan(0);
    expect(catalog.groups.map(g => g.groupName)).toEqual([
      'Source Bible',
      'Translation Notes',
      'Translation Words',
      'Translation Questions',
      'Bible Commentary',
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
    const wordsTextId = 'tier-2-translation-words-text';
    const wordsTextMember = buildManifestFixture().find(
      item => item.id === wordsTextId,
    )!;

    const manifest = [
      ...buildManifestFixture().filter(item => item.id !== wordsTextId),
      { ...wordsTextMember, id: `${wordsTextId}-part-a` },
      {
        ...wordsTextMember,
        id: `${wordsTextId}-part-b`,
        bytesTotal: TEXT_BYTES + 500,
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
    expect(wordsText.bytes).toBe(TEXT_BYTES + (TEXT_BYTES + 500));
    expect(wordsText.manifestMembers).toHaveLength(2);
  });

  it('filterPrepareOfflineCatalogByTiers keeps only matching tiers', () => {
    const catalog = buildTestCatalog({ chapters, selectedIds: new Set([1]) });

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
    ]);
  });

  it('locks tier 1 from deselection', () => {
    expect(isTierLocked(1)).toBe(true);
    expect(isTierLocked(2)).toBe(false);
    expect(isTierLocked(3)).toBe(false);
  });

  it('locks required non-removable, completed, and tier 1 items in customize', () => {
    const base = {
      id: 'Translation Words:text',
      tier: 2 as const,
      kind: 'text' as const,
      groupName: 'Translation Words',
      label: 'Text',
      bytes: 10 * MB,
      manifestMembers: [],
    };
    const requiredLocked = {
      ...base,
      status: 'selected' as const,
      required: true,
      removable: false,
    };
    const completedItem = {
      ...base,
      status: 'completed' as const,
      required: false,
      removable: true,
    };
    const pendingItem = {
      ...base,
      status: 'selected' as const,
      required: false,
      removable: true,
    };
    const downloadingItem = {
      ...base,
      status: 'downloading' as const,
      required: false,
      removable: true,
    };

    expect(isItemCustomizeLocked(requiredLocked)).toBe(true);
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
      required: false,
      removable: true,
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
      required: false,
      removable: true,
      manifestMembers: [],
    };

    expect(isItemIncluded(completedItem, new Set([completedItem.id]))).toBe(
      true,
    );
  });

  it('computes total bytes for the effective download set', () => {
    const catalog = buildTestCatalog({ chapters, selectedIds: new Set([1]) });

    // 10 fixture items: 5 text @ TEXT_BYTES + 5 audio @ AUDIO_BYTES.
    expect(computeTotalBytes(catalog, new Set())).toBe(
      5 * TEXT_BYTES + 5 * AUDIO_BYTES,
    );
  });

  it('subtracts deselected tier 2/3 rows from totals', () => {
    const catalog = buildTestCatalog({ chapters, selectedIds: new Set([1]) });
    const questionsTextId = 'Translation Questions:text';

    const deselected = new Set([questionsTextId]);
    const withoutQuestionsText = computeTotalBytes(catalog, deselected);

    expect(withoutQuestionsText).toBe(
      computeTotalBytes(catalog, new Set()) - TEXT_BYTES,
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
    const wordsAudioId = 'tier-2-translation-words-audio';
    const manifest = buildManifestFixture().map(item =>
      item.id === wordsAudioId ? { ...item, id: `${item.id}-x` } : item,
    );
    const catalog = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest,
      getResourceStatus: resourceId =>
        // Only the single "audio" member whose id still resolves as a row member.
        resourceId === `${wordsAudioId}-x` ? 'completed' : 'selected',
    });

    // One audio member completed → row status 'completed' → excluded from pending.
    expect(computePendingBytes(catalog, new Set())).toBe(
      computeTotalBytes(catalog, new Set()) - AUDIO_BYTES,
    );
  });

  it('reduces pending bytes when tier 2/3 rows are deselected', () => {
    const catalog = buildTestCatalog({ chapters, selectedIds: new Set([1]) });
    const questionsAudioId = 'Translation Questions:audio';

    const pendingAll = computePendingBytes(catalog, new Set());
    const pendingDeselected = computePendingBytes(
      catalog,
      new Set([questionsAudioId]),
    );

    expect(pendingDeselected).toBe(pendingAll - AUDIO_BYTES);
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
        required: true,
        removable: false,
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
        required: true,
        removable: false,
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
        bytes: 12 * MB,
        status: 'completed',
        required: false,
        removable: true,
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
        bytes: 24 * MB,
        status: 'selected',
        progress: 0.5,
        required: false,
        removable: true,
        manifestMembers: [],
      }),
    ).toBe(24 * MB);
  });

  it('buildEffectiveCatalog omits deselected tier 2/3 from summary groups', () => {
    const catalog = buildTestCatalog({ chapters, selectedIds: new Set([1]) });
    const deselected = new Set(
      catalog.items.filter(item => item.tier >= 2).map(item => item.id),
    );

    const effective = buildEffectiveCatalog(catalog, deselected);

    expect(effective.groups.map(group => group.groupName)).toEqual([
      'Source Bible',
      'Translation Notes',
    ]);
    expect(effective.items).toHaveLength(4);
    expect(computeTotalBytes(effective, new Set())).toBe(
      2 * TEXT_BYTES + 2 * AUDIO_BYTES,
    );
    expect(computePendingBytes(effective, new Set())).toBe(
      2 * TEXT_BYTES + 2 * AUDIO_BYTES,
    );
  });

  it('aggregates status across members: any downloading → downloading, all completed → completed', () => {
    const base = {
      tier: 2 as const,
      kind: 'audio' as const,
      resourceName: 'Translation Words',
      label: 'Audio',
      required: false,
      removable: true,
      bytesTotal: 100,
      fileExt: 'mp3',
      languageCode: 'eng',
    };
    const manifest: PrepareOfflineResourceManifestItem[] = [
      { ...base, id: 'tw-audio-a' },
      { ...base, id: 'tw-audio-b' },
    ];

    // All members downloading → row downloading.
    const downloading = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest,
      getResourceStatus: () => 'downloading',
    });
    expect(downloading.items[0].status).toBe('downloading');

    // All members completed → row completed.
    const completed = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest,
      getResourceStatus: () => 'completed',
    });
    expect(completed.items[0].status).toBe('completed');

    // Mixed selected/downloading → downloading wins over passthrough.
    const mixed = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest,
      getResourceStatus: id =>
        id === 'tw-audio-b' ? 'downloading' : 'selected',
    });
    expect(mixed.items[0].status).toBe('downloading');

    // All selected → passthrough of first member's status.
    const fresh = buildTestCatalog({
      chapters,
      selectedIds: new Set([1]),
      manifest,
      getResourceStatus: () => 'selected',
    });
    expect(fresh.items[0].status).toBe('selected');
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
  });
});
