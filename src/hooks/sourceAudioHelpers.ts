import type {
  ApiSourceAudioItem,
  ApiSourceAudioResponse,
  ApiSourceAudioVerseTimestamp,
} from '../types/api/sourceAudio';

/** Prefer mp3 for expo-audio; otherwise first playable item. */
export function pickSourceAudioItem(
  items: ApiSourceAudioItem[],
): ApiSourceAudioItem | null {
  if (items.length === 0) return null;
  return items.find(item => item.format === 'mp3') ?? items[0] ?? null;
}

/** Verse start offset in ms from provider timestamps (0 when missing). */
export function verseStartMs(
  verse: number,
  timestamps: ApiSourceAudioVerseTimestamp[] | undefined,
  preferredDblAudioBibleId?: string,
): number {
  if (!timestamps?.length) return 0;
  const matches = timestamps.filter(t => t.verse === verse);
  if (matches.length === 0) return 0;
  const preferred =
    preferredDblAudioBibleId !== undefined
      ? matches.find(t => t.dblAudioBibleId === preferredDblAudioBibleId)
      : undefined;
  const entry = preferred ?? matches[0];
  const startSeconds = entry?.startSeconds;
  if (startSeconds === undefined || !Number.isFinite(startSeconds)) return 0;
  return Math.max(0, Math.round(startSeconds * 1000));
}

export function chapterSourceAudioCacheKey(args: {
  projectId: number;
  bookCode: string;
  chapter: number;
  bibleId: number;
  languageCode: string;
}): string {
  return [
    args.projectId,
    args.bookCode,
    args.chapter,
    args.bibleId,
    args.languageCode,
  ].join('|');
}

export function resolveSourceAudioUri(
  response: ApiSourceAudioResponse,
): { uri: string; item: ApiSourceAudioItem } | null {
  const item = pickSourceAudioItem(response.items);
  if (!item?.url) return null;
  return { uri: item.url, item };
}

/**
 * True when the preferred playable item's signed URL has expired.
 * `expiresAt` is Unix seconds; values already in ms (>= 1e12) are accepted.
 */
export function isSourceAudioItemExpired(
  item: ApiSourceAudioItem,
  nowMs: number = Date.now(),
): boolean {
  if (item.expiresAt === undefined || !Number.isFinite(item.expiresAt)) {
    return false;
  }
  const expiresAtMs =
    item.expiresAt >= 1_000_000_000_000
      ? item.expiresAt
      : item.expiresAt * 1000;
  return expiresAtMs <= nowMs;
}

/** Cached chapter responses are usable only while the selected item is unexpired. */
export function isCachedSourceAudioResponseValid(
  response: ApiSourceAudioResponse,
  nowMs: number = Date.now(),
): boolean {
  const item = pickSourceAudioItem(response.items);
  if (!item) return true;
  return !isSourceAudioItemExpired(item, nowMs);
}
