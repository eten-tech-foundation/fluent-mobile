import type { RecordingGranularity } from './recordingRange';

export type TakeSubtitleInput = {
  takeNumber: number;
  granularity: RecordingGranularity;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};

/**
 * Take-card label (#410): "Take N - Pericope - vv. X-Y" or "Take N - Verse - v. X".
 * Cross-chapter pericopes include chapter numbers in the verse span.
 */
export function formatTakeSubtitle(take: TakeSubtitleInput): string {
  const n = take.takeNumber;
  if (take.granularity === 'pericope') {
    const sameChapter = take.startChapter === take.endChapter;
    const span = sameChapter
      ? `vv. ${take.startVerse}-${take.endVerse}`
      : `vv. ${take.startChapter}:${take.startVerse}-${take.endChapter}:${take.endVerse}`;
    return `Take ${n} - Pericope - ${span}`;
  }
  return `Take ${n} - Verse - v. ${take.startVerse}`;
}
