export function formatDuration(ms: number): string {
  const safeMs = ms < 0 ? 0 : ms;
  const totalCentis = Math.floor(safeMs / 10);
  const totalSeconds = Math.floor(totalCentis / 100);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = totalCentis % 100;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}:${pad(centis)}`;
}

export function verseReference(
  bookName: string,
  chapter: number,
  verse: number,
): string {
  return `${bookName} ${chapter}:${verse}`;
}
