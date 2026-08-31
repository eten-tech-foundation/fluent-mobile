import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';
import { downloadResourcePath, ensureDownloadsDir } from './downloadStorage';
import {
  markDownloadItemCancelled,
  markDownloadItemCompleted,
  markDownloadItemFailed,
  markDownloadItemPaused,
  updateDownloadItemProgress,
} from '../db/downloadQueueRepository';
import type { DownloadQueueItem } from '../types/download/types';
import { markDownloadItemDownloading } from '../db/downloadQueueRepository';

const log = logger.create('DownloadQueueWorker');

export type WorkerSessionState =
  | 'idle'
  | 'downloading'
  | 'paused'
  | 'cancelled';

export type ResourceResolver = (
  item: DownloadQueueItem,
) => Promise<{ url: string; ext: string }>;

type ActiveDownload = {
  itemId: string;
  resumable: FileSystem.DownloadResumable;
  /** Set when pauseAsync succeeds — reused on cancel to avoid double-pause. */
  savedPauseState?: string;
  /**
   * Set synchronously by cancel() before any await. `cancel()` also flips
   * `this.state` back to 'idle' once it's done, so a pending
   * downloadAsync()/resumeAsync() continuation racing with cancel() cannot
   * rely on `this.state === 'cancelled'` — that check can lose the race and
   * let a cancelled item get marked 'completed'. This flag lives on the
   * captured ActiveDownload object itself, so it's immune to that race.
   */
  cancelled?: boolean;
};

type SavedDownloadState = {
  url?: string;
  fileUri?: string;
  options?: FileSystem.DownloadOptions;
  resumeData?: string;
};

type DownloadPauseState = Awaited<
  ReturnType<FileSystem.DownloadResumable['pauseAsync']>
>;

function serializeDownloadState(
  state: DownloadPauseState | undefined,
): string | undefined {
  return state ? JSON.stringify(state) : undefined;
}

function parseDownloadState(
  value: string | undefined,
): SavedDownloadState | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as SavedDownloadState;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export class DownloadQueueWorker {
  private state: WorkerSessionState = 'idle';
  private active: ActiveDownload | null = null;
  private queue: DownloadQueueItem[] = [];
  private resolver: ResourceResolver;

  constructor(resolver: ResourceResolver) {
    this.resolver = resolver;
  }

  getState(): WorkerSessionState {
    return this.state;
  }

  async start(items: DownloadQueueItem[]): Promise<void> {
    if (this.state === 'downloading' || this.state === 'paused') {
      log.info('start() called while downloading or paused; ignoring');
      return;
    }
    this.queue = [...items];
    this.state = 'downloading';
    await this.processNext();
  }

  async pause(): Promise<void> {
    if (this.state !== 'downloading' || !this.active) {
      return;
    }
    const previousState = this.state;
    this.state = 'paused';
    try {
      const pauseState = await this.active.resumable.pauseAsync();
      const serialized = serializeDownloadState(pauseState);
      if (serialized) {
        this.active.savedPauseState = serialized;
      }
      await markDownloadItemPaused(this.active.itemId, serialized);
    } catch (error) {
      log.error('Failed to pause active download', { error });
      // The native transfer may still be running — don't report a paused
      // state that doesn't reflect reality.
      this.state = previousState;
    }
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused' || !this.active) {
      return;
    }
    const activeAtStart = this.active;
    const { itemId, resumable } = activeAtStart;
    this.state = 'downloading';
    try {
      await markDownloadItemDownloading(itemId);
      const result = await resumable.resumeAsync();

      // A concurrent cancel() may have run while resumeAsync() was in
      // flight. cancel() flips `this.state` to 'idle' once it finishes, so
      // that check alone can lose the race — check the flag cancel() set
      // synchronously on this specific download instead.
      if (activeAtStart.cancelled) {
        return;
      }

      if (result) {
        await this.handleItemComplete(itemId, result.uri);
      }
    } catch (error) {
      log.error('Failed to resume download', { error, itemId });
      if (activeAtStart.cancelled) {
        return;
      }
      try {
        await markDownloadItemFailed(itemId);
      } catch (innerError) {
        log.error('Failed to mark item failed after resume error', {
          error: innerError,
          itemId,
        });
      }
      this.active = null;
      await this.processNext();
    }
  }

  async cancel(): Promise<void> {
    const wasPaused = this.state === 'paused';
    const active = this.active;

    // Set synchronously, before any await, so a racing
    // processNext()/resume() continuation always observes it regardless of
    // ordering — see ActiveDownload.cancelled.
    if (active) {
      active.cancelled = true;
    }

    this.state = 'cancelled';
    this.queue = [];

    try {
      if (active) {
        const { itemId, resumable, savedPauseState } = active;

        if (wasPaused) {
          // Already paused — do not call pauseAsync again (native throws
          // "No download object available"). Resume data was persisted on pause.
          await markDownloadItemCancelled(itemId, savedPauseState);
        } else {
          try {
            const pauseState = await resumable.pauseAsync();
            await markDownloadItemCancelled(
              itemId,
              serializeDownloadState(pauseState),
            );
          } catch (error) {
            log.error('Failed to pause on cancel', { error, itemId });
            await markDownloadItemCancelled(itemId, savedPauseState);
          }
        }
      }
    } finally {
      this.active = null;
      this.state = 'idle';
    }
  }

  private async processNext(): Promise<void> {
    if (this.state !== 'downloading') {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      this.state = 'idle';
      return;
    }

    let activeAtStart: ActiveDownload | undefined;
    try {
      const saved = parseDownloadState(next.resumeData);
      const { url, ext } = await this.resolver(next);
      await ensureDownloadsDir(next.projectId ?? 0);
      const destPath =
        saved?.fileUri ??
        next.localFilePath ??
        downloadResourcePath(next.projectId ?? 0, next.id, ext);

      const resumable = FileSystem.createDownloadResumable(
        saved?.url ?? url,
        destPath,
        saved?.options ?? {},
        progress => {
          const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
          if (totalBytesExpectedToWrite > 0) {
            updateDownloadItemProgress(
              next.id,
              totalBytesWritten / totalBytesExpectedToWrite,
            ).catch(error => {
              log.error('Failed to persist download progress', {
                error,
                itemId: next.id,
              });
            });
          }
        },
        saved?.resumeData,
      );

      activeAtStart = { itemId: next.id, resumable };
      this.active = activeAtStart;
      await markDownloadItemDownloading(next.id);
      const shouldResume = Boolean(saved?.resumeData);
      const result = shouldResume
        ? await resumable.resumeAsync()
        : await resumable.downloadAsync();
      // A concurrent cancel() may have run while the transfer was in
      // flight. cancel() flips `this.state` to 'idle' once it finishes, so
      // that check alone can lose the race — check the flag cancel() set
      // synchronously on this specific download instead.
      if (activeAtStart.cancelled) {
        return;
      }
      if (result) {
        await this.handleItemComplete(next.id, result.uri);
      }
    } catch (error) {
      log.error('Failed to download item', { error, itemId: next.id });
      if (activeAtStart?.cancelled) {
        return;
      }
      try {
        await markDownloadItemFailed(next.id);
      } catch (innerError) {
        log.error('Failed to mark item failed after download error', {
          error: innerError,
          itemId: next.id,
        });
      }
      this.active = null;
      await this.processNext();
    }
  }

  private async handleItemComplete(itemId: string, uri: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(uri);
    await markDownloadItemCompleted(
      itemId,
      uri,
      info.exists ? info.size : undefined,
    );
    this.active = null;
    await this.processNext();
  }
}
