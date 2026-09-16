import type { RecordingGranularity } from './recordingRange';

/**
 * Display granularity — deliberately wider than the persisted
 * `RecordingGranularity`. `'stitched'` (#411) labels a synthetic aggregate of
 * several verse takes, so no `recordings` row can ever hold it.
 */
export type TakeSubtitleGranularity = RecordingGranularity | 'stitched';

export type TakeSubtitleInput = {
  takeNumber: number;
  granularity: TakeSubtitleGranularity;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};

/** Cross-chapter spans carry chapter numbers; same-chapter spans do not. */
function formatSpan(take: TakeSubtitleInput): string {
  return take.startChapter === take.endChapter
    ? `vv. ${take.startVerse}-${take.endVerse}`
    : `vv. ${take.startChapter}:${take.startVerse}-${take.endChapter}:${take.endVerse}`;
}

/**
 * Take-card label (#410): "Take N - Pericope - vv. X-Y" or "Take N - Verse - v. X".
 * Stitched rows (#411) reuse the pericope span rules: "Take N - Stitched - vv. X-Y".
 */
export function formatTakeSubtitle(take: TakeSubtitleInput): string {
  const n = take.takeNumber;
  if (take.granularity === 'stitched') {
    return `Take ${n} - Stitched - ${formatSpan(take)}`;
  }
  if (take.granularity === 'pericope') {
    return `Take ${n} - Pericope - ${formatSpan(take)}`;
  }
  return `Take ${n} - Verse - v. ${take.startVerse}`;
}
