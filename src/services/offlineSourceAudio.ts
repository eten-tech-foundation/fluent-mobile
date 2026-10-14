import * as FileSystem from 'expo-file-system/legacy';
import type {
  ApiSourceAudioBible,
  ApiSourceAudioFormat,
  ApiSourceAudioItem,
  ApiSourceAudioProvider,
  ApiSourceAudioResponse,
  ApiSourceAudioVerseTimestamp,
} from '../types/api/sourceAudio';
import { fileExists, ensureDownloadsDir } from './downloadStorage';
import { findDownloadedRows } from './offlineResources';
import { logger } from '../utils/logger';

function pickSourceAudioItem(
  items: ApiSourceAudioItem[],
): ApiSourceAudioItem | null {
  if (items.length === 0) return null;
  return items.find(item => item.format === 'mp3') ?? items[0] ?? null;
}

const log = logger.create('offlineSourceAudio');

/** Prepare for Offline / download_queue resource_name for Tier 1 source audio. */
export const SOURCE_BIBLE_RESOURCE_NAME = 'Source Bible';

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export type SourceAudioChapterMeta = {
  provider: ApiSourceAudioProvider;
  bible: ApiSourceAudioBible;
  bookCode: string;
  chapter: number;
  verseTimestamps?: ApiSourceAudioVerseTimestamp[];
  format: ApiSourceAudioFormat;
  durationSeconds?: number;
  dblAudioBibleId?: string;
  sizeBytes?: number;
};

export type ResolveLocalChapterSourceAudioArgs = {
  projectId: number;
  bookCode: string;
  chapter: number;
  /** Active account — required for download_queue lookup. */
  userId: number | null;
};

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(
      `Unsafe ${label} for source-audio meta path: ${JSON.stringify(value)}`,
    );
  }
}

/** Sidecar JSON next to Prepare for Offline downloads — verse seek offline (#579). */
export function sourceAudioMetaPath(
  projectId: number,
  bookCode: string,
  chapter: number,
): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('FileSystem.documentDirectory is unavailable');
  }
  assertSafeSegment(bookCode, 'bookCode');
  if (!Number.isInteger(chapter) || chapter <= 0) {
    throw new Error(`Invalid chapter for source-audio meta path: ${chapter}`);
  }
  return `${root}downloads/${projectId}/source-audio-meta/${bookCode}-${chapter}.json`;
}

function metaFromResponse(
  response: ApiSourceAudioResponse,
): SourceAudioChapterMeta | null {
  const item = pickSourceAudioItem(response.items);
  if (!item) return null;
  return {
    provider: response.provider,
    bible: response.bible,
    bookCode: response.bookCode,
    chapter: response.chapter,
    verseTimestamps: response.verseTimestamps,
    format: item.format,
    durationSeconds: item.durationSeconds,
    dblAudioBibleId: item.dblAudioBibleId,
    sizeBytes: item.sizeBytes,
  };
}

/**
 * Persist verse timestamps / bible metadata for a chapter so offline play
 * can seek after Prepare for Offline without a prior online play (#579).
 */
export async function persistSourceAudioChapterMeta(
  projectId: number,
  response: ApiSourceAudioResponse,
): Promise<void> {
  const meta = metaFromResponse(response);
  if (!meta) return;
  try {
    await ensureDownloadsDir(projectId);
    const metaDir = `${FileSystem.documentDirectory}downloads/${projectId}/source-audio-meta/`;
    const dirInfo = await FileSystem.getInfoAsync(metaDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(metaDir, { intermediates: true });
    }
    const path = sourceAudioMetaPath(
      projectId,
      response.bookCode,
      response.chapter,
    );
    await FileSystem.writeAsStringAsync(path, JSON.stringify(meta));
  } catch (error) {
    log.warn('Failed to persist source-audio metadata', {
      projectId,
      bookCode: response.bookCode,
      chapter: response.chapter,
      error,
    });
  }
}

export async function readSourceAudioChapterMeta(
  projectId: number,
  bookCode: string,
  chapter: number,
): Promise<SourceAudioChapterMeta | null> {
  try {
    const path = sourceAudioMetaPath(projectId, bookCode, chapter);
    if (!(await fileExists(path))) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as SourceAudioChapterMeta;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.bookCode !== bookCode ||
      parsed.chapter !== chapter
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    log.warn('Failed to read source-audio metadata', {
      projectId,
      bookCode,
      chapter,
      error,
    });
    return null;
  }
}

/**
 * Local-first Source Bible audio for a chapter. Returns null when nothing is
 * downloaded so the caller can fall back to the API (or show empty offline).
 */
export async function resolveLocalChapterSourceAudio(
  args: ResolveLocalChapterSourceAudioArgs,
): Promise<ApiSourceAudioResponse | null> {
  const bookCode = args.bookCode.trim();
  if (!bookCode || args.projectId <= 0) return null;

  const rows = await findDownloadedRows({
    projectId: args.projectId,
    userId: args.userId,
    resourceName: SOURCE_BIBLE_RESOURCE_NAME,
    kind: 'audio',
    bookCode,
    chapterNumber: args.chapter,
  });
  if (rows === null || rows.length === 0) return null;

  let localFilePath: string | undefined;
  for (const row of rows) {
    if (!row.localFilePath) continue;
    if (await fileExists(row.localFilePath)) {
      localFilePath = row.localFilePath;
      break;
    }
  }
  if (!localFilePath) return null;

  const meta = await readSourceAudioChapterMeta(
    args.projectId,
    bookCode,
    args.chapter,
  );
  const format: ApiSourceAudioFormat = meta?.format ?? 'mp3';

  return {
    provider: meta?.provider ?? 'aquifer',
    bible: meta?.bible ?? {
      name: 'Source',
      abbreviation: 'Source',
    },
    bookCode,
    chapter: args.chapter,
    verseTimestamps: meta?.verseTimestamps,
    items: [
      {
        format,
        url: localFilePath,
        scope: 'chapter',
        durationSeconds: meta?.durationSeconds,
        dblAudioBibleId: meta?.dblAudioBibleId,
        sizeBytes: meta?.sizeBytes,
        // Local files do not expire — omit expiresAt so in-memory cache stays valid.
      },
    ],
  };
}
