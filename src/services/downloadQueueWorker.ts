import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';
import { downloadResourcePath, ensureDownloadsDir } from './downloadStorage';
import {
  markDownloadItemCompleted,
  markDownloadItemFailed,
  updateDownloadItemProgress,
} from '../db/downloadQueueRepository';
import type { DownloadQueueItem } from '../types/download/types';

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
};

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
      await this.active.resumable.pauseAsync();
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
    const { itemId, resumable } = this.active;
    this.state = 'downloading';
    try {
      const result = await resumable.resumeAsync();

      // A concurrent cancel() may have run while resumeAsync() was in
      // flight — don't restart queue processing on top of a cancelled
      // session. Cast needed: TS narrows `this.state` to 'downloading'
      // after the assignment above and doesn't account for cancel()
      // mutating it asynchronously from a different method.
      if ((this.state as WorkerSessionState) === 'cancelled') {
        return;
      }

      if (result) {
        await this.handleItemComplete(itemId, result.uri);
      }
    } catch (error) {
      log.error('Failed to resume download', { error, itemId });
      try {
        await markDownloadItemFailed(itemId);
      } catch (innerError) {
        log.error('Failed to mark item failed after resume error', {
          error: innerError,
          itemId,
        });
      }
      if ((this.state as WorkerSessionState) !== 'cancelled') {
        this.active = null;
        await this.processNext();
      }
    }
  }

  async cancel(): Promise<void> {
    this.state = 'cancelled';
    if (this.active) {
      try {
        await this.active.resumable.pauseAsync();
      } catch (error) {
        log.error('Failed to pause on cancel', { error });
      }
    }
    this.active = null;
    this.queue = [];
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

    try {
      const { url, ext } = await this.resolver(next);
      await ensureDownloadsDir(next.projectId ?? 0);
      const destPath = downloadResourcePath(next.projectId ?? 0, next.id, ext);

      const resumable = FileSystem.createDownloadResumable(
        url,
        destPath,
        {},
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
      );

      this.active = { itemId: next.id, resumable };
      const result = await resumable.downloadAsync();
      if (result) {
        await this.handleItemComplete(next.id, result.uri);
      }
    } catch (error) {
      log.error('Failed to download item', { error, itemId: next.id });
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
