import { verseStartMs } from '../../../../hooks/sourceAudioHelpers';
import type { ApiSourceAudioVerseTimestamp } from '../../../../types/api/sourceAudio';
import type { PassageVerse } from '../../../../hooks/usePassage';

export interface SourceWindow {
  startMs: number;
  endMs: number;
}

/**
 * The stretch of the chapter's source file the passage covers, from its
 * first verse to the start of the verse after its last. Null without verse
 * timestamps, when the whole chapter stands in. Source audio is the
 * assignment's chapter only (Q12), so other chapters' verses don't count.
 */
export function sourceWindow(
  verses: PassageVerse[],
  chapterNumber: number,
  timestamps: ApiSourceAudioVerseTimestamp[] | undefined,
  dblAudioBibleId: string | undefined,
  durationMs: number,
): SourceWindow | null {
  if (!timestamps?.length || durationMs <= 0) return null;
  const inChapter = verses
    .filter(v => v.chapterNumber === chapterNumber)
    .map(v => v.verseNumber);
  if (inChapter.length === 0) return null;
  const first = Math.min(...inChapter);
  const last = Math.max(...inChapter);
  const later = timestamps
    .map(t => t.verse)
    .filter(v => v > last)
    .sort((a, b) => a - b)[0];
  const startMs = verseStartMs(first, timestamps, dblAudioBibleId);
  const endMs =
    later === undefined
      ? durationMs
      : verseStartMs(later, timestamps, dblAudioBibleId);
  return endMs > startMs ? { startMs, endMs } : null;
}

/** 0–1 through the window, or through the chapter without one. */
export function windowProgress(
  positionMs: number,
  durationMs: number,
  window: SourceWindow | null,
): number {
  if (window) {
    const ratio =
      (positionMs - window.startMs) / (window.endMs - window.startMs);
    return Math.min(1, Math.max(0, ratio));
  }
  return durationMs > 0 ? positionMs / durationMs : 0;
}

/** A scrub's 0–1 as a position in the file. */
export function windowSeekMs(
  ratio: number,
  durationMs: number,
  window: SourceWindow | null,
): number {
  if (window) {
    return Math.round(window.startMs + ratio * (window.endMs - window.startMs));
  }
  return Math.round(ratio * durationMs);
}
