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

function queueRow(
  id: string,
  status: DownloadQueueItem['status'],
  progress: number,
  projectId = 1,
): DownloadQueueItem {
  return { id, tier: 1, label: id, progress, status, projectId };
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

    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, queueItems, 1);

    expect(merged.items[0].status).toBe('downloading');
    // Byte-weighted: m1 at 25% of 1000/4000 total; m2 not enqueued = 0.
    expect(merged.items[0].progress).toBeCloseTo(0.0625, 5);
  });

  it('shows completed only when every member is completed', () => {
    const full = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'completed', 1), queueRow('m2', 'completed', 1)],
      1,
    );
    expect(full.items[0].status).toBe('completed');
    expect(full.items[0].progress).toBeUndefined();
  });

  it('keeps catalog baseline with weighted progress while members finish between transfers', () => {
    // m1 completed, m2 not yet picked up by the worker (still queued).
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'completed', 1), queueRow('m2', 'queued', 0)],
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
    );

    expect(merged.items[0].status).toBe('paused');
    expect(merged.items[0].progress).toBeCloseTo(0.375, 5);
  });

  it('leaves rows untouched when no member has a queue row', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('other-id', 'downloading', 0.9)],
      1,
    );

    expect(merged.items[0].status).toBe('selected');
    expect(merged.items[0].progress).toBeUndefined();
  });

  it('ignores queue rows for other projects', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'downloading', 0.5, 99)],
      1,
    );

    expect(merged.items[0].status).toBe('selected');
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
    );

    expect(merged.items[0].status).toBe('downloading');
    expect(merged.items[0].progress).toBe(0.42);
  });

  it('returns the catalog unchanged when the queue has no rows for the project', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, [], 1);

    expect(merged).toBe(catalog);
  });

  it('returns the catalog unchanged when projectId is null', () => {
    const merged = mergeQueueIntoPrepareOfflineCatalog(
      catalog,
      [queueRow('m1', 'downloading', 0.5)],
      null,
    );

    expect(merged).toBe(catalog);
  });
});
