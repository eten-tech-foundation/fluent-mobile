/** Clamped ratio of `filled` to `total` (0 when `total` is 0). */
export function verseProgressRatio(filled: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, filled / total));
}

export function offlineDownloadLabel(filled: number, total: number): string {
  const percent = Math.round(verseProgressRatio(filled, total) * 100);
  return `Not offline ready, ${percent}% downloaded`;
}
