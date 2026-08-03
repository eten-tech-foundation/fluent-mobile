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
    if (this.state === 'downloading') {
      log.info('start() called while already downloading; ignoring');
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
    this.state = 'paused';
    try {
      await this.active.resumable.pauseAsync();
    } catch (error) {
      log.error('Failed to pause active download', { error });
    }
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused' || !this.active) {
      return;
    }
    this.state = 'downloading';
    try {
      const result = await this.active.resumable.resumeAsync();
      if (result) {
        await this.handleItemComplete(this.active.itemId, result.uri);
      }
    } catch (error) {
      log.error('Failed to resume download', {
        error,
        itemId: this.active.itemId,
      });
      await markDownloadItemFailed(this.active.itemId);
      this.active = null;
      await this.processNext();
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
            void updateDownloadItemProgress(
              next.id,
              totalBytesWritten / totalBytesExpectedToWrite,
            );
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
      await markDownloadItemFailed(next.id);
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
