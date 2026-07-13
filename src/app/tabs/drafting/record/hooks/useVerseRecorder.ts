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
  aacDurationMs,
  buildRecordingKey,
  concatenateAacSegments,
  deleteRecordingFile,
  extensionFromUri,
  moveIntoStore,
  remuxTakeToSeekableContainer,
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
import {
  getSpikeFlag,
  SPIKE_MANIFEST_EXTENSION,
  writeSpikeManifest,
} from '../../../../../spike/m4aSpike';

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
        setPausedTake({
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
        if (bibleTextId === null) return;
        clearPausedTake(bibleTextId);
      },

      deletePausedFiles: fileUris =>
        fileUris.forEach(fileUri => deleteRecordingFile(fileUri)),

      onCommit: async ({ fileUris, durationMs }) => {
        if (bibleTextId === null) return null;

        // SPIKE (#176): keep the raw ADTS segments and persist a JSON manifest
        // instead of merging + remuxing into a single seekable `.m4a`, so the
        // segmented playback hook can be evaluated on a real multi-segment take.
        // Read the flag imperatively (this runs at commit time, not render).
        // Defaults off; the production single-file path below is untouched.
        if (getSpikeFlag('keepSegmentManifest')) {
          const recordingId = randomUUID();
          const manifestKey = buildRecordingKey({
            userId: userId ?? '',
            projectId: projectId ?? 0,
            bookCode: bookCode ?? '',
            chapterNumber: chapterNumber ?? 0,
            verseNumber: verseNumber ?? 0,
            recordingId,
            extension: SPIKE_MANIFEST_EXTENSION,
          });
          try {
            const written = await writeSpikeManifest(manifestKey, fileUris);
            return await insertRecording({
              id: recordingId,
              bibleTextId,
              userId: userId ?? null,
              chapterAssignmentId: chapterAssignmentId ?? null,
              localFilePath: written.key,
              durationMs: written.totalMs > 0 ? written.totalMs : durationMs,
              fileSizeBytes: written.sizeBytes,
            });
          } catch (error) {
            log.error('Failed to commit spike segment manifest', {
              bibleTextId,
              error,
            });
            return null;
          }
        }

        // Merge the take's segments into a single file. For a one-segment take
        // this returns that file unchanged (moveIntoStore relocates it below);
        // for a multi-segment take (resumed across a kill) it produces a new
        // merged file, leaving the raw segments to be unlinked afterwards.
        let mergedUri: string;
        try {
          mergedUri = await concatenateAacSegments(fileUris);
        } catch (error) {
          log.error('Failed to concatenate recording segments', {
            bibleTextId,
            segments: fileUris.length,
            error,
          });
          return null;
        }

        // Derive the true length from the audio itself; the wall-clock timer
        // undercounts (esp. after a kill). Probe the merged file while it still
        // exists at its source path (before moveIntoStore relocates it) and
        // fall back to the timer value if the probe yields nothing.
        const probedMs = await aacDurationMs(mergedUri);
        const committedDurationMs = probedMs > 0 ? probedMs : durationMs;

        // Repackage the take into a seekable MP4 container for review playback;
        // raw ADTS is not reliably seekable in ExoPlayer. Probe duration above
        // first — it walks ADTS frame headers, which the `.m4a` no longer has.
        // Falls back to the ADTS file when the native remuxer is unavailable.
        //
        // SPIKE (#176): the `skipRemux` debug flag commits the merged ADTS take
        // as-is (single `.aac`, no native remux) so seek behaviour can be
        // compared against the remuxed `.m4a`. Read imperatively (commit time,
        // not render); defaults off, leaving the production path untouched.
        const playbackUri = getSpikeFlag('skipRemux')
          ? mergedUri
          : await remuxTakeToSeekableContainer(mergedUri);

        const recordingId = randomUUID();
        const key = buildRecordingKey({
          userId: userId ?? '',
          projectId: projectId ?? 0,
          bookCode: bookCode ?? '',
          chapterNumber: chapterNumber ?? 0,
          verseNumber: verseNumber ?? 0,
          recordingId,
          extension: extensionFromUri(playbackUri),
        });

        // Move the take out of the evictable cache before recording it in the
        // DB so a row never points at a file the OS could reclaim.
        let moved;
        try {
          moved = await moveIntoStore({ sourceUri: playbackUri, key });
        } catch (error) {
          log.error('Failed to move recording into durable store', {
            bibleTextId,
            error,
          });
          return null;
        }

        // Unlink every intermediate file except the one just moved into the
        // store (whose source path no longer exists). When remux produced a new
        // `.m4a`, that includes the raw segments and the merged `.aac`; when it
        // fell back, `playbackUri === mergedUri` stays and only the extra raw
        // segments of a multi-segment take are removed.
        const leftovers = new Set<string>([...fileUris, mergedUri]);
        leftovers.delete(playbackUri);
        leftovers.forEach(fileUri => deleteRecordingFile(fileUri));

        try {
          return await insertRecording({
            id: recordingId,
            bibleTextId,
            userId: userId ?? null,
            chapterAssignmentId: chapterAssignmentId ?? null,
            localFilePath: moved.key,
            durationMs: committedDurationMs,
            fileSizeBytes: moved.sizeBytes,
          });
        } catch (error) {
          log.error(
            'Failed to insert recording after move; removing durable file',
            { bibleTextId, localFilePath: moved.key, error },
          );
          deleteRecordingFile(moved.key);
          return null;
        }
      },

      deleteCommitted: take => deleteRecordingById(take.id),

      resolvePlaybackUri: take => resolveRecordingUri(take.localFilePath),

      resolveDurationMs: take => take.durationMs ?? null,
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
