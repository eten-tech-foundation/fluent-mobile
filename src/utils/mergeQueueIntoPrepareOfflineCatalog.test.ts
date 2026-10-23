import { mergeQueueIntoPrepareOfflineCatalog } from './mergeQueueIntoPrepareOfflineCatalog';
import {
  PrepareOfflineCatalog,
  PrepareOfflineResourceItem,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';
import type { DownloadQueueItem } from '../types/download/types';

function member(
  id: string,
  bytesTotal: number,
  overrides: Partial<PrepareOfflineResourceManifestItem> = {},
): PrepareOfflineResourceManifestItem {
  return {
    id,
    tier: 1,
    kind: 'audio',
    resourceName: 'Source Bible',
    label: id,
    required: true,
    removable: false,
    bytesTotal,
    sourceUrl: `https://example.com/${id}`,
    fileExt: 'mp3',
    languageCode: 'eng',
    bookCode: 'MRK',
    startChapter: 1,
    endChapter: 1,
    ...overrides,
  };
}

function row(
  overrides: Partial<PrepareOfflineResourceItem> = {},
  members: PrepareOfflineResourceManifestItem[] = [],
): PrepareOfflineResourceItem {
  return {
    id: 'Source Bible:audio',
    tier: 1,
    kind: 'audio',
    groupName: 'Source Bible',
    label: 'Audio',
    bytes: members.reduce((sum, m) => sum + m.bytesTotal, 0),
    status: 'selected',
    required: true,
    removable: false,
    manifestMembers: members,
    ...overrides,
  };
}

/**
 * Builds a queue row shaped like the real repository output: `id` is the
 * scoped `${projectId}-${userId}-${resourceId}` string (see
 * buildDownloadQueueId), and `resourceId` is the raw manifest id that
 * catalog members and legacy rows are actually matched against.
 */
function queueRow(
  resourceId: string,
  status: DownloadQueueItem['status'],
  progress: number,
  projectId = 1,
  userId = 1,
  bytesTotal?: number,
): DownloadQueueItem {
  return {
    id: `${projectId}-${userId}-${resourceId}`,
    resourceId,
    tier: 1,
    label: resourceId,
    progress,
    status,
    projectId,
    userId,
    ...(bytesTotal !== undefined ? { bytesTotal } : {}),
  };
}

const MEMBERS = [member('m1', 1000), member('m2', 3000)];

const aggregatedRow = row({}, MEMBERS);

const catalog: PrepareOfflineCatalog = {
  items: [aggregatedRow],
  groups: [{ groupName: 'Source Bible', items: [aggregatedRow] }],
};

describe('mergeQueueIntoPrepareOfflineCatalog', () => {
  it('aggregates across manifest members: one downloading member marks row downloading', () => {
    const queueItems: DownloadQueueItem[] = [
      queueRow('m1', 'downloading', 0.25),
    ];

    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      queueItems,
      1,
      1,
    );

    expect(merged.items[0].status).toBe('downloading');
    // Byte-weighted: m1 at 25% of 1000/4000 total; m2 not enqueued = 0.
    expect(merged.items[0].progress).toBeCloseTo(0.0625, 5);
  });

  it('shows completed only when every member is completed', () => {
    const full = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'completed', 1), queueRow('m2', 'completed', 1)],
      1,
      1,
    );
    expect(full.items[0].status).toBe('completed');
    expect(full.items[0].progress).toBeUndefined();
  });

  it('fail-before/pass-after: recovers positive completed queue bytesTotal (#756)', () => {
    // Catalog wire-0 unknown images; worker persists real info.size on complete.
    const unknownImages = row(
      {
        id: 'Reference Images:image',
        kind: 'image',
        groupName: 'Reference Images',
        label: 'Image',
        bytes: 0,
        sizeKnown: false,
        status: 'selected',
        required: false,
        removable: true,
      },
      [
        member('img-a', 0, {
          kind: 'image',
          resourceName: 'Reference Images',
          fileExt: 'jpg',
        }),
        member('img-b', 0, {
          kind: 'image',
          resourceName: 'Reference Images',
          fileExt: 'jpg',
        }),
      ],
    );
    const unknownCatalog: PrepareOfflineCatalog = {
      items: [unknownImages],
      groups: [{ groupName: 'Reference Images', items: [unknownImages] }],
    };

    const merged = mergeQueueIntoPrepareOfflineCatalog(
      unknownCatalog,
      [
        queueRow('img-a', 'completed', 1, 1, 1, 4096),
        queueRow('img-b', 'completed', 1, 1, 1, 2048),
      ],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('completed');
    expect(merged.items[0].bytes).toBe(6144);
    expect(merged.items[0].sizeKnown).toBe(true);
  });

  it('fail-before/pass-after: mixed completed recovery stays incomplete / At least (#756)', () => {
    const unknownImages = row(
      {
        id: 'Reference Images:image',
        kind: 'image',
        groupName: 'Reference Images',
        label: 'Image',
        bytes: 0,
        sizeKnown: false,
        status: 'selected',
        required: false,
        removable: true,
      },
      [
        member('img-a', 0, {
          kind: 'image',
          resourceName: 'Reference Images',
          fileExt: 'jpg',
        }),
        member('img-b', 0, {
          kind: 'image',
          resourceName: 'Reference Images',
          fileExt: 'jpg',
        }),
      ],
    );
    const unknownCatalog: PrepareOfflineCatalog = {
      items: [unknownImages],
      groups: [],
    };

    // One member recovered positive size; other completed without usable bytes
    // (wire 0 / missing info.size) — keep incomplete with partial known sum.
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      unknownCatalog,
      [
        queueRow('img-a', 'completed', 1, 1, 1, 4096),
        queueRow('img-b', 'completed', 1, 1, 1, 0),
      ],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('completed');
    expect(merged.items[0].bytes).toBe(4096);
    expect(merged.items[0].sizeKnown).toBe(false);
  });

  it('fail-before/pass-after: completed wire-0 queue bytes do not claim known zero (#756)', () => {
    const unknownImages = row(
      {
        id: 'Reference Images:image',
        kind: 'image',
        groupName: 'Reference Images',
        label: 'Image',
        bytes: 0,
        sizeKnown: false,
        status: 'selected',
        required: false,
        removable: true,
      },
      [
        member('img-a', 0, {
          kind: 'image',
          resourceName: 'Reference Images',
          fileExt: 'jpg',
        }),
      ],
    );
    const unknownCatalog: PrepareOfflineCatalog = {
      items: [unknownImages],
      groups: [],
    };

    const merged = mergeQueueIntoPrepareOfflineCatalog(
      unknownCatalog,
      [queueRow('img-a', 'completed', 1, 1, 1, 0)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('completed');
    // No positive recovery evidence — do not flip sizeKnown or invent knowledge.
    expect(merged.items[0].sizeKnown).toBe(false);
    expect(merged.items[0].bytes).toBe(0);
  });

  it('fail-before/pass-after: known-zero no-sourceUrl + positive recovery stays exact (#756 CR)', () => {
    // Intended case for CodeRabbit 4337223293: placeholder known-zero member
    // (no sourceUrl) must not force "At least" when the other member recovers.
    const mixed = row(
      {
        id: 'Bundle:mixed',
        kind: 'text',
        groupName: 'Bundle',
        label: 'Text',
        bytes: 0,
        sizeKnown: false,
        status: 'selected',
        required: false,
        removable: true,
      },
      [
        member('placeholder', 0, {
          kind: 'text',
          resourceName: 'Bundle',
          fileExt: 'json',
          sourceUrl: undefined,
        }),
        member('remote-img', 0, {
          kind: 'image',
          resourceName: 'Bundle',
          fileExt: 'jpg',
        }),
      ],
    );
    const mixedCatalog: PrepareOfflineCatalog = {
      items: [mixed],
      groups: [],
    };

    const merged = mergeQueueIntoPrepareOfflineCatalog(
      mixedCatalog,
      [
        queueRow('placeholder', 'completed', 1, 1, 1, 0),
        queueRow('remote-img', 'completed', 1, 1, 1, 4096),
      ],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('completed');
    expect(merged.items[0].bytes).toBe(4096);
    expect(merged.items[0].sizeKnown).toBe(true);
  });

  it('fail-before/pass-after: queue zero does not erase positive known manifest (#756 CR)', () => {
    const knownAudio = row(
      {
        id: 'Source Bible:audio',
        kind: 'audio',
        groupName: 'Source Bible',
        label: 'Audio',
        bytes: 2048,
        sizeKnown: true,
        status: 'selected',
        required: true,
        removable: false,
      },
      [member('audio-1', 2048)],
    );
    const knownCatalog: PrepareOfflineCatalog = {
      items: [knownAudio],
      groups: [],
    };

    // Worker reported 0 (missing/empty info) but manifest already knows 2048.
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      knownCatalog,
      [queueRow('audio-1', 'completed', 1, 1, 1, 0)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('completed');
    expect(merged.items[0].bytes).toBe(2048);
    expect(merged.items[0].sizeKnown).toBe(true);
  });

  it('keeps catalog baseline with weighted progress while members finish between transfers', () => {
    // m1 completed, m2 not yet picked up by the worker (still queued).
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'completed', 1), queueRow('m2', 'queued', 0)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('selected');
    expect(merged.items[0].progress).toBeCloseTo(0.25, 5);
  });

  it('shows paused when a member is paused and none downloading', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m2', 'paused', 0.5)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('paused');
    expect(merged.items[0].progress).toBeCloseTo(0.375, 5);
  });

  it('leaves rows untouched when no member has a queue row', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('other-id', 'downloading', 0.9)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('selected');
    expect(merged.items[0].progress).toBeUndefined();
  });

  it('ignores queue rows for other projects', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'downloading', 0.5, 99, 1)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('selected');
  });

  it('ignores queue rows for other users when a userId is given', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'downloading', 0.5, 1, 42)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('selected');
    expect(merged.items[0].progress).toBeUndefined();
  });

  it('still overlays legacy rows keyed by the catalog row id', () => {
    const legacyCatalog: PrepareOfflineCatalog = {
      items: [
        row({
          id: 'tier-1-source-bible-text',
          kind: 'text',
          groupName: 'Source Bible',
          label: 'Text',
          bytes: 4096,
          manifestMembers: [],
        }),
      ],
      groups: [],
    };

    const merged = mergeQueueIntoPrepareOfflineCatalog(
      legacyCatalog,
      [queueRow('tier-1-source-bible-text', 'downloading', 0.42)],
      1,
      1,
    );

    expect(merged.items[0].status).toBe('downloading');
    expect(merged.items[0].progress).toBe(0.42);
  });

  it('returns the catalog unchanged when the queue has no rows for the project', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, [], 1, 1);

    expect(merged).toBe(catalog);
  });

  it('returns the catalog unchanged when projectId is null', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'downloading', 0.5)],
      null,
      1,
    );

    expect(merged).toBe(catalog);
  });
});
