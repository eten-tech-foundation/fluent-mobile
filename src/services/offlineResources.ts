import * as FileSystem from 'expo-file-system/legacy';
import { getDownloadedResourcesForChapter } from '../db/downloadQueueRepository';
import type { DownloadQueueItem } from '../types/download/types';
import { rowCoversVerse } from '../utils/parseVerseScope';
import { logger } from '../utils/logger';

const log = logger.create('offlineResources');

export type OfflineLookup = {
  projectId: number | null;
  userId?: number | null;
  resourceName: string; // 'Translation Notes' | 'Translation Questions' | 'Reference Images'
  kind: 'text' | 'audio' | 'image';
  bookCode: string;
  chapterNumber: number;
  /** Omit for chapter-level resources such as images. */
  verseNumber?: number;
};

/**
 * Returns null when nothing is downloaded for this chapter, so the caller
 * can fall back to the API. Returns [] when it is downloaded but nothing
 * covers this verse.
 */
export async function findDownloadedRows(
  lookup: OfflineLookup,
): Promise<DownloadQueueItem[] | null> {
  if (lookup.projectId === null || lookup.userId == null) {
    return null;
  }
  const rows = (
    await getDownloadedResourcesForChapter(
      lookup.projectId,
      lookup.userId,
      lookup.resourceName,
      lookup.kind,
      lookup.bookCode,
      lookup.chapterNumber,
    )
  ).filter(row => row.localFilePath);

  if (rows.length === 0) {
    return null;
  }
  if (lookup.verseNumber === undefined) {
    return rows;
  }
  const verse = lookup.verseNumber;
  return rows.filter(row => rowCoversVerse(row, verse));
}

/** Reads a downloaded JSON file. Returns undefined if it can't be read. */
export async function readDownloadedJson(
  row: DownloadQueueItem,
): Promise<unknown | undefined> {
  try {
    const raw = await FileSystem.readAsStringAsync(row.localFilePath!);
    return JSON.parse(raw);
  } catch (error) {
    log.warn('Failed to read downloaded file', { id: row.id, error });
    return undefined;
  }
}
