import { mergeQueueIntoPrepareOfflineCatalog } from './mergeQueueIntoPrepareOfflineCatalog';
import {
  PrepareOfflineCatalog,
  PrepareOfflineResourceItem,
} from '../types/prepareOffline/types';
import type { DownloadQueueItem } from '../types/download/types';

const baseItem: PrepareOfflineResourceItem = {
  id: 'tier-1-source-bible-text',
  tier: 1,
  kind: 'text',
  groupName: 'Source Bible',
  label: 'Text',
  bytes: 8 * 1024 * 1024,
  status: 'selected',
};

const catalog: PrepareOfflineCatalog = {
  items: [baseItem],
  groups: [{ groupName: 'Source Bible', items: [baseItem] }],
};

describe('mergeQueueIntoPrepareOfflineCatalog', () => {
  it('overlays downloading status and progress', () => {
    const queueItems: DownloadQueueItem[] = [
      {
        id: baseItem.id,
        tier: 1,
        label: 'Text',
        progress: 0.42,
        status: 'downloading',
        projectId: 1,
      },
    ];

    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, queueItems, 1);
    const item = merged.items[0];

    expect(item.status).toBe('downloading');
    expect(item.progress).toBe(0.42);
  });

  it('overlays paused status and progress', () => {
    const queueItems: DownloadQueueItem[] = [
      {
        id: baseItem.id,
        tier: 1,
        label: 'Text',
        progress: 0.42,
        status: 'paused',
        projectId: 1,
      },
    ];

    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, queueItems, 1);
    const item = merged.items[0];

    expect(item.status).toBe('paused');
    expect(item.progress).toBe(0.42);
  });

  it('overlays completed status from queue', () => {
    const queueItems: DownloadQueueItem[] = [
      {
        id: baseItem.id,
        tier: 1,
        label: 'Text',
        progress: 1,
        status: 'completed',
        projectId: 1,
      },
    ];

    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, queueItems, 1);

    expect(merged.items[0].status).toBe('completed');
  });

  it('leaves queued items at catalog status', () => {
    const queueItems: DownloadQueueItem[] = [
      {
        id: baseItem.id,
        tier: 1,
        label: 'Text',
        progress: 0,
        status: 'queued',
        projectId: 1,
      },
    ];

    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, queueItems, 1);

    expect(merged.items[0].status).toBe('selected');
    expect(merged.items[0].progress).toBeUndefined();
  });

  it('preserves partial progress on cancelled queue rows', () => {
    const queueItems: DownloadQueueItem[] = [
      {
        id: baseItem.id,
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'cancelled',
        projectId: 1,
      },
    ];

    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, queueItems, 1);

    expect(merged.items[0].status).toBe('selected');
    expect(merged.items[0].progress).toBe(0.5);
  });

  it('ignores queue rows for other projects', () => {
    const queueItems: DownloadQueueItem[] = [
      {
        id: baseItem.id,
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'downloading',
        projectId: 99,
      },
    ];

    const merged = mergeQueueIntoPrepareOfflineCatalog(catalog, queueItems, 1);

    expect(merged.items[0].status).toBe('selected');
  });
});
