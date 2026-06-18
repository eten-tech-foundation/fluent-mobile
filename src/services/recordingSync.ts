/**
 * recordingSync.ts
 *
 * Background upload worker for pending audio recordings.
 * Called by the colleague's UI sync button.
 *
 * Flow:
 *  1. Read all rows where sync_status = 'pending' from SQLite.
 *  2. For each row: mark 'syncing', upload to the server, mark 'synced' or 'failed'.
 *  3. Return a summary { synced, failed } for the caller to display.
 *
 * The server derives user identity from the Bearer token — no user ID is
 * sent in the request body.
 */

import { API_BASE_URL } from '@env';
import RNFS from 'react-native-fs';

import {
  getPendingRecordings,
  PendingRecording,
  updateRecordingSyncStatus,
} from '../db/repository';
import { logger } from '../utils/logger';

const log = logger.create('RecordingSync');

// ─── Config ───────────────────────────────────────────────────────────────────

const SYNC_API_URL = `${API_BASE_URL}/recordings/sync`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveAbsolutePath(relativePath: string): string {
  return `${RNFS.DocumentDirectoryPath}/Projects/${relativePath}`;
}

function getFilename(relativePath: string): string {
  return relativePath.split('/').pop() ?? 'recording.m4a';
}

function toFileUri(absolutePath: string): string {
  return absolutePath.startsWith('file://')
    ? absolutePath
    : `file://${absolutePath}`;
}

// ─── Single-file upload ───────────────────────────────────────────────────────

async function uploadRecording(
  job: PendingRecording,
  token: string,
): Promise<void> {
  const absolutePath = deriveAbsolutePath(job.relative_path);
  const fileUri = toFileUri(absolutePath);

  log.info('Upload attempt', {
    url: SYNC_API_URL,
    absolutePath,
    fileUri,
  });

  // Guard: ensure the audio file still exists on device before attempting upload
  const exists = await RNFS.exists(absolutePath);
  if (!exists) {
    throw new Error(`Audio file not found on device: ${absolutePath}`);
  }

  const formData = new FormData();
  formData.append('project_unit_id', String(job.project_unit_id));
  formData.append('bible_text_id', String(job.bible_text_id));
  formData.append('relative_path', job.relative_path);
  if (job.file_size !== null && job.file_size !== undefined) {
    formData.append('file_size', String(job.file_size));
  }
  formData.append('recorded_at', job.last_updated_at);

  formData.append('file', {
    uri: fileUri,
    name: getFilename(job.relative_path),
    type: 'audio/mp4',
  } as unknown as Blob);

  let response: Response;
  try {
    response = await fetch(SYNC_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: formData,
    });
  } catch (networkError) {
    throw new Error(
      `Network error: ${
        networkError instanceof Error
          ? networkError.message
          : String(networkError)
      }`,
    );
  }

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(
      body?.message ?? `Upload failed with status ${response.status}`,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SyncResult {
  synced: number;
  failed: number;
  failedPaths: string[];
}

let isSyncWorkerRunning = false;

export async function syncPendingRecordings(
  userToken: string,
): Promise<SyncResult> {
  if (isSyncWorkerRunning) {
    log.info('Sync worker already running, skipping duplicate trigger.');
    return { synced: 0, failed: 0, failedPaths: [] };
  }
  isSyncWorkerRunning = true;

  try {
    log.info('Starting recording sync...');

    const pending = await getPendingRecordings();

    if (pending.length === 0) {
      log.info('No pending recordings to sync.');
      return { synced: 0, failed: 0, failedPaths: [] };
    }

    log.info(`Found ${pending.length} pending recording(s).`);

    let synced = 0;
    let failed = 0;
    const failedPaths: string[] = [];

    for (const job of pending) {
      await updateRecordingSyncStatus(job.id, 'syncing');

      try {
        await uploadRecording(job, userToken);
        await updateRecordingSyncStatus(job.id, 'synced');
        log.info('Recording synced', { id: job.id, path: job.relative_path });
        synced++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateRecordingSyncStatus(job.id, 'pending', message);
        log.error('Recording sync failed', {
          id: job.id,
          path: job.relative_path,
          error: message,
        });
        failed++;
        failedPaths.push(job.relative_path);
      }
    }

    log.info('Recording sync complete.', { synced, failed });
    return { synced, failed, failedPaths };
  } finally {
    isSyncWorkerRunning = false;
  }
}
