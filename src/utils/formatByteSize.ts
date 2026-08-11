const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Human-readable byte size for download labels (e.g. `8 MB`, `136 MB`). */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < KB) {
    return `${bytes} B`;
  }

  if (bytes < MB) {
    return `${Math.round(bytes / KB)} KB`;
  }

  const mb = bytes / MB;
  if (Math.abs(mb - Math.round(mb)) < 0.05) {
    return `${Math.round(mb)} MB`;
  }

  return `${mb.toFixed(1)} MB`;
}

/** Device storage summary sizes (may use GB for large values). */
export function formatStorageCapacity(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes >= GB) {
    const gb = bytes / GB;
    if (Math.abs(gb - Math.round(gb)) < 0.05) {
      return `${Math.round(gb)} GB`;
    }
    return `${gb.toFixed(1)} GB`;
  }

  return formatByteSize(bytes);
}

export function formatAvailableDeviceStorage(
  availableBytes: number | null,
  totalBytes: number | null,
): string {
  if (availableBytes != null && totalBytes != null) {
    return `${formatStorageCapacity(availableBytes)} of ${formatStorageCapacity(
      totalBytes,
    )}`;
  }

  if (availableBytes != null) {
    return formatStorageCapacity(availableBytes);
  }

  return '—';
}
