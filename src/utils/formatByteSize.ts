const KB = 1024;
const MB = KB * 1024;

/** Human-readable byte size for download labels (e.g. `8 MB`, `136 MB`). */
export function formatByteSize(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }

  if (bytes < KB) {
    return `${bytes} B`;
  }

  if (bytes < MB) {
    return `${Math.round(bytes / KB)} KB`;
  }

  const mb = bytes / MB;
  if (mb >= 10 || Math.abs(mb - Math.round(mb)) < 0.05) {
    return `${Math.round(mb)} MB`;
  }

  return `${mb.toFixed(1)} MB`;
}
