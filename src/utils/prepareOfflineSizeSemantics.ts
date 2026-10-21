import type {
  PrepareOfflineResourceItem,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';
import { formatByteSize } from './formatByteSize';

/**
 * Provider/API may omit Aquifer asset.size and coerce to wire 0
 * (`asset?.size ?? 0` in fluent-api `buildManifestItem`). A remote
 * downloadable row with bytesTotal 0 is unknown size, not free (#756).
 * Synced/Included rows and true empty placeholders have no sourceUrl.
 */
export function isManifestItemSizeKnown(
  item: Pick<PrepareOfflineResourceManifestItem, 'bytesTotal' | 'sourceUrl'>,
): boolean {
  if (item.bytesTotal > 0) {
    return true;
  }
  if (item.sourceUrl) {
    return false;
  }
  return true;
}

export function isResourceItemSizeKnown(
  item: Pick<PrepareOfflineResourceItem, 'sizeKnown' | 'displayValue'>,
): boolean {
  if (item.displayValue === 'Included') {
    return true;
  }
  return item.sizeKnown !== false;
}

export interface DownloadSizeSummary {
  knownBytes: number;
  hasUnknown: boolean;
}

/**
 * Sum known subset bytes (including lower bounds already stored on
 * size-unknown rows); flag when any selected row is size-unknown.
 */
export function summarizeDownloadSizes(
  items: PrepareOfflineResourceItem[],
): DownloadSizeSummary {
  let knownBytes = 0;
  let hasUnknown = false;
  for (const item of items) {
    if (!isResourceItemSizeKnown(item)) {
      hasUnknown = true;
    }
    knownBytes += item.bytes;
  }
  return { knownBytes, hasUnknown };
}

/** Row trailing size label — never show unknown remote bytes as `0 B`. */
export function formatResourceSizeLabel(
  item: Pick<
    PrepareOfflineResourceItem,
    'bytes' | 'sizeKnown' | 'displayValue'
  >,
): string {
  if (item.displayValue) {
    return item.displayValue;
  }
  if (!isResourceItemSizeKnown(item)) {
    return item.bytes > 0
      ? `At least ${formatByteSize(item.bytes)}`
      : 'Unknown';
  }
  return formatByteSize(item.bytes);
}

/** Total download row — incomplete when unknowns remain selected. */
export function formatDownloadTotalLabel(summary: DownloadSizeSummary): string {
  if (!summary.hasUnknown) {
    return formatByteSize(summary.knownBytes);
  }
  if (summary.knownBytes > 0) {
    return `At least ${formatByteSize(summary.knownBytes)}`;
  }
  return 'Size incomplete';
}

/** Idle Download CTA — do not advertise an exact total when sizes are unknown. */
export function formatDownloadButtonLabel(
  summary: DownloadSizeSummary,
): string {
  if (!summary.hasUnknown) {
    if (summary.knownBytes > 0) {
      return `Download ${formatByteSize(summary.knownBytes)}`;
    }
    return `Download ${formatByteSize(0)}`;
  }
  if (summary.knownBytes > 0) {
    return `Download at least ${formatByteSize(summary.knownBytes)}`;
  }
  return 'Download (size incomplete)';
}

/** Pending work exists when bytes remain or unknown-size items are not completed. */
export function hasPendingDownloadWork(
  items: PrepareOfflineResourceItem[],
): boolean {
  for (const item of items) {
    if (item.status === 'completed') {
      continue;
    }
    if (!isResourceItemSizeKnown(item)) {
      return true;
    }
    if (item.bytes > 0) {
      return true;
    }
  }
  return false;
}
