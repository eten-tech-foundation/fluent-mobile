import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  deleteRecordingById,
  insertRecording,
} from '../../../../../db/repository';
import { getLatestRecordingForVerse } from '../../../../../db/queries';
import {
  clearPausedTake,
  getPausedTake,
  setPausedTake,
} from '../../../../../services/storage';
import {
  buildRecordingKey,
  deleteRecordingFile,
  extensionFromUri,
  moveIntoStore,
  resolveRecordingUri,
} from '../../../../../services/recordingStorage';
import type { Recording } from '../../../../../types/db/types';
import { logger } from '../../../../../utils/logger';
import type {
  PausedTakeState,
  RecorderAdapter,
  UseRecorderApi,
} from '../../../../../hooks/useRecorder';
import { useRecorder } from '../../../../../hooks/useRecorder';

const log = logger.create('useVerseRecorder');

/**
 * Attribution context used to build the durable file path and persist who/where
 * a take belongs to. `bibleTextId === null` keeps the recorder inert until a
 * verse is resolved. The remaining fields are optional so the hook stays usable
 * in isolation (e.g. tests), falling back to placeholder path segments.
 */
export interface UseVerseRecorderArgs {
  bibleTextId: number | null;
  userId?: string;
  projectId?: number | null;
  chapterAssignmentId?: number | null;
  bookCode?: string | null;
  chapterNumber?: number | null;
  verseNumber?: number | null;
}

export type VerseRecorderApi = UseRecorderApi<Recording>;

/**
 * Adapts the generic {@link useRecorder} to the verse-recording use case: it
 * wires SQLite persistence, the verse-shaped durable storage layout, and the
 * paused-take marker (keyed by `bibleTextId`). The recorder itself stays
 * agnostic of all of this.
 */
export function useVerseRecorder({
  bibleTextId,
  userId,
  projectId,
  chapterAssignmentId,
  bookCode,
  chapterNumber,
  verseNumber,
}: UseVerseRecorderArgs): VerseRecorderApi {
  const adapter = useMemo<RecorderAdapter<Recording>>(
    () => ({
      sessionKey: bibleTextId,

      loadInitial: key => getLatestRecordingForVerse(key as number),

      loadPaused: key => getPausedTake(key as number),

      persistPaused: (state: PausedTakeState) => {
        if (bibleTextId === null) return;
        setPausedTake({ bibleTextId, ...state });
      },

      clearPaused: () => {
        if (bibleTextId === null) return;
        clearPausedTake(bibleTextId);
      },

      deletePausedFile: fileUri => deleteRecordingFile(fileUri),

      onCommit: async ({ fileUri, durationMs }) => {
        if (bibleTextId === null) return null;

        const recordingId = randomUUID();
        const key = buildRecordingKey({
          userId: userId ?? '',
          projectId: projectId ?? 0,
          bookCode: bookCode ?? '',
          chapterNumber: chapterNumber ?? 0,
          verseNumber: verseNumber ?? 0,
          recordingId,
          extension: extensionFromUri(fileUri),
        });

        // Move the take out of the evictable cache before recording it in the
        // DB so a row never points at a file the OS could reclaim.
        let moved;
        try {
          moved = await moveIntoStore({ sourceUri: fileUri, key });
        } catch (error) {
          log.error('Failed to move recording into durable store', {
            bibleTextId,
            error,
          });
          return null;
        }

        return insertRecording({
          id: recordingId,
          bibleTextId,
          userId: userId ?? null,
          chapterAssignmentId: chapterAssignmentId ?? null,
          localFilePath: moved.key,
          durationMs,
          fileSizeBytes: moved.sizeBytes,
        });
      },

      deleteCommitted: take => deleteRecordingById(take.id),

      resolvePlaybackUri: take => resolveRecordingUri(take.localFilePath),
    }),
    [
      bibleTextId,
      userId,
      projectId,
      chapterAssignmentId,
      bookCode,
      chapterNumber,
      verseNumber,
    ],
  );

  return useRecorder(adapter);
}
