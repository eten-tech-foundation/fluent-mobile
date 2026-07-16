import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  deleteRecordingById,
  upsertLatestRecordingForUser,
} from '../../../../../db/repository';
import { getLatestRecordingForVerse } from '../../../../../db/queries';
import {
  clearPausedTake,
  getPausedTake,
  setPausedTake,
} from '../../../../../services/storage';
import {
  aacDurationMs,
  buildRecordingKey,
  concatenateAacSegments,
  deleteRecordingFile,
  extensionFromUri,
  moveIntoStore,
  resolveRecordingUri,
} from '../../../../../services/recordingStorage';
import type { Recording } from '../../../../../types/db/types';
import { logger } from '../../../../../utils/logger';
import {
  useRecorder,
  type PausedTakeState,
  type RecordingSessionDeps,
  type UseRecorderApi,
} from '../../../../../hooks/useRecorder';

const log = logger.create('useVerseRecorder');

/**
 * Attribution context used to build the durable file path and persist who/where
 * a take belongs to. `bibleTextId === null` or empty `userId` keeps the
 * recorder inert until both are resolved.
 */
export interface UseVerseRecorderArgs {
  bibleTextId: number | null;
  userId: string;
  projectId?: number | null;
  projectUnitId?: number | null;
  chapterAssignmentId?: number | null;
  bookCode?: string | null;
  chapterNumber?: number | null;
  verseNumber?: number | null;
}

export type VerseRecorderApi = UseRecorderApi;

/**
 * Verse draft recorder: owns SQLite upsert (one latest per user+verse), durable
 * storage layout, and paused-take markers keyed by user.
 */
export function useVerseRecorder({
  bibleTextId,
  userId,
  projectId,
  projectUnitId,
  chapterAssignmentId,
  bookCode,
  chapterNumber,
  verseNumber,
}: UseVerseRecorderArgs): VerseRecorderApi {
  const deps = useMemo<RecordingSessionDeps>(() => {
    const sessionKey =
      bibleTextId !== null && userId ? `${userId}:${bibleTextId}` : null;

    return {
      sessionKey,

      loadInitial: async () => {
        if (bibleTextId === null || !userId) return null;
        return getLatestRecordingForVerse(bibleTextId, userId);
      },

      loadPaused: () => {
        if (bibleTextId === null || !userId) return null;
        return getPausedTake(userId, bibleTextId);
      },

      persistPaused: (state: PausedTakeState) => {
        if (bibleTextId === null || !userId) return;
        setPausedTake({
          userId,
          bibleTextId,
          ...(chapterAssignmentId !== null && chapterAssignmentId !== undefined
            ? { chapterAssignmentId }
            : {}),
          ...(verseNumber !== null && verseNumber !== undefined
            ? { verseNumber }
            : {}),
          ...state,
        });
      },

      clearPaused: () => {
        if (bibleTextId === null || !userId) return;
        clearPausedTake(userId, bibleTextId);
      },

      deletePausedFiles: fileUris =>
        fileUris.forEach(fileUri => deleteRecordingFile(fileUri)),

      onCommit: async ({ fileUris, durationMs }) => {
        if (bibleTextId === null || !userId) return null;

        let mergedUri: string;
        try {
          mergedUri = await concatenateAacSegments(fileUris);
        } catch (error) {
          log.error('Failed to concatenate recording segments', {
            bibleTextId,
            userId,
            segments: fileUris.length,
            error,
          });
          return null;
        }

        const probedMs = await aacDurationMs(mergedUri);
        const committedDurationMs = probedMs > 0 ? probedMs : durationMs;

        const recordingId = randomUUID();
        const key = buildRecordingKey({
          userId,
          projectId: projectId ?? 0,
          bookCode: bookCode ?? '',
          chapterNumber: chapterNumber ?? 0,
          verseNumber: verseNumber ?? 0,
          recordingId,
          extension: extensionFromUri(mergedUri),
        });

        let moved;
        try {
          moved = await moveIntoStore({ sourceUri: mergedUri, key });
        } catch (error) {
          log.error('Failed to move recording into durable store', {
            bibleTextId,
            userId,
            error,
          });
          return null;
        }

        fileUris
          .filter(fileUri => fileUri !== mergedUri)
          .forEach(fileUri => deleteRecordingFile(fileUri));

        try {
          return await upsertLatestRecordingForUser({
            id: recordingId,
            bibleTextId,
            userId,
            projectUnitId: projectUnitId ?? null,
            chapterAssignmentId: chapterAssignmentId ?? null,
            localFilePath: moved.key,
            durationMs: committedDurationMs,
            fileSizeBytes: moved.sizeBytes,
          });
        } catch (error) {
          log.error(
            'Failed to upsert recording after move; removing durable file',
            { bibleTextId, userId, localFilePath: moved.key, error },
          );
          deleteRecordingFile(moved.key);
          return null;
        }
      },

      deleteCommitted: (take: Recording) => deleteRecordingById(take.id),

      resolvePlaybackUri: (take: Recording) =>
        resolveRecordingUri(take.localFilePath),

      resolveDurationMs: (take: Recording) => take.durationMs ?? null,
    };
  }, [
    bibleTextId,
    userId,
    projectId,
    projectUnitId,
    chapterAssignmentId,
    bookCode,
    chapterNumber,
    verseNumber,
  ]);

  return useRecorder(deps);
}
