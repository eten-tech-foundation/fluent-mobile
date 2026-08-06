import type { DownloadQueueItem } from '../types/download/types';
import type { ResourceResolver } from './downloadQueueWorker';

export const queuedResourceResolver: ResourceResolver = async (
  item: DownloadQueueItem,
) => {
  if (item.sourceUrl && item.fileExt) {
    return { url: item.sourceUrl, ext: item.fileExt };
  }

  throw new Error(
    `No download source configured for item ${item.id}. ` +
      'Queue callers must provide sourceUrl/fileExt from the #51 resource manifest contract.',
  );
};
