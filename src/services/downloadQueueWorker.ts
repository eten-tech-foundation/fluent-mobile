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

/** Distinguishes intentional UI pause from transport-loss pause (#619). */
export type DownloadPauseReason = 'user' | 'transport';

export type ResourceResolver = (
  item: DownloadQueueItem,
) => Promise<{ url: string; ext: string }>;

/** Returns true when Wi-Fi / cellular policy allows a transfer (#546 / #619). */
export type TransportAllowsFn = () => Promise<boolean>;

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

const alwaysAllowTransport: TransportAllowsFn = async () => true;

export class DownloadQueueWorker {
  private state: WorkerSessionState = 'idle';
  private pauseReason: DownloadPauseReason | null = null;
  private active: ActiveDownload | null = null;
  private queue: DownloadQueueItem[] = [];
  private resolver: ResourceResolver;
  private transportAllows: TransportAllowsFn;

  constructor(
    resolver: ResourceResolver,
    transportAllows: TransportAllowsFn = alwaysAllowTransport,
  ) {
    this.resolver = resolver;
    this.transportAllows = transportAllows;
  }

  getState(): WorkerSessionState {
    return this.state;
  }

  /** Why the worker is paused, or null when not paused. */
  getPauseReason(): DownloadPauseReason | null {
    return this.state === 'paused' ? this.pauseReason : null;
  }

  async start(items: DownloadQueueItem[]): Promise<void> {
    if (this.state === 'downloading' || this.state === 'paused') {
      log.info('start() called while downloading or paused; ignoring');
      return;
    }
    this.queue = [...items];
    this.pauseReason = null;
    this.state = 'downloading';
    await this.processNext();
  }

  async pause(reason: DownloadPauseReason = 'user'): Promise<void> {
    // Promote a transport pause to a user pause so auto-resume will not undo it.
    if (this.state === 'paused' && reason === 'user') {
      this.pauseReason = 'user';
      return;
    }
    if (this.state !== 'downloading') {
      return;
    }
    if (!this.active) {
      // Waiting between items (UI pause or transport blocked before start).
      this.pauseReason = reason;
      this.state = 'paused';
      return;
    }
    const previousState = this.state;
    this.pauseReason = reason;
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
      this.pauseReason = null;
      this.state = previousState;
    }
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      return;
    }
    if (!(await this.transportAllows())) {
      log.info('resume() skipped until transport allows transfer');
      return;
    }

    // Paused with no in-flight resumable (blocked before the next queued item).
    if (!this.active) {
      this.pauseReason = null;
      this.state = 'downloading';
      await this.processNext();
      return;
    }

    const activeAtStart = this.active;
    const { itemId, resumable } = activeAtStart;
    this.pauseReason = null;
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
      if (!(await this.transportAllows())) {
        await this.pauseAfterTransportLoss(activeAtStart, itemId);
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
    this.pauseReason = null;
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

    if (!(await this.transportAllows())) {
      log.info('Transport blocked before next download item; pausing queue', {
        itemId: next.id,
      });
      this.queue.unshift(next);
      // Do not overwrite a concurrent user pause reason.
      if (this.state === 'downloading') {
        this.pauseReason = 'transport';
        this.state = 'paused';
      }
      return;
    }

    // Concurrent pause() may have won while we awaited transport.
    if (this.state !== 'downloading') {
      this.queue.unshift(next);
      return;
    }

    let activeAtStart: ActiveDownload | undefined;
    try {
      const saved = parseDownloadState(next.resumeData);
      const { url, ext } = await this.resolver(next);

      if (this.state !== 'downloading') {
        this.queue.unshift(next);
        return;
      }

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

      if (this.state !== 'downloading') {
        this.queue.unshift(next);
        return;
      }

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
      // A finished transfer should complete even if pause() raced — otherwise
      // pauseAsync failure can leave a stuck downloading+active state.
      if (result) {
        await this.handleItemComplete(next.id, result.uri);
      }
    } catch (error) {
      log.error('Failed to download item', { error, itemId: next.id });
      if (activeAtStart?.cancelled) {
        return;
      }
      if (!(await this.transportAllows())) {
        if (!activeAtStart) {
          this.queue.unshift(next);
          if (this.state === 'downloading') {
            this.pauseReason = 'transport';
            this.state = 'paused';
          }
          return;
        }
        await this.pauseAfterTransportLoss(activeAtStart, next.id);
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

  /**
   * Persist a pause (with resume data when possible) instead of marking the
   * item failed when the link no longer allows transfer (#619).
   */
  private async pauseAfterTransportLoss(
    active: ActiveDownload | undefined,
    itemId: string,
  ): Promise<void> {
    // Preserve an intentional UI pause if it won the race.
    if (this.state === 'paused' && this.pauseReason === 'user') {
      if (!active) {
        return;
      }
    } else {
      this.pauseReason = 'transport';
      this.state = 'paused';
    }
    if (!active) {
      return;
    }
    try {
      const pauseState = await active.resumable.pauseAsync();
      const serialized = serializeDownloadState(pauseState);
      if (serialized) {
        active.savedPauseState = serialized;
      }
      await markDownloadItemPaused(itemId, serialized);
    } catch (pauseError) {
      log.warn(
        'pauseAsync failed after transport loss; marking paused anyway',
        {
          error: pauseError,
          itemId,
        },
      );
      try {
        await markDownloadItemPaused(itemId, active.savedPauseState);
      } catch (innerError) {
        log.error('Failed to mark item paused after transport loss', {
          error: innerError,
          itemId,
        });
      }
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
