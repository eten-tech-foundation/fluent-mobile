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

type ResolvingDownload = {
  itemId: string;
  /**
   * Set synchronously by dropItems()/cancel() while processNext has shifted
   * an item but not yet assigned `this.active` (awaiting transport/resolver).
   */
  cancelled: boolean;
};

export class DownloadQueueWorker {
  private state: WorkerSessionState = 'idle';
  private pauseReason: DownloadPauseReason | null = null;
  private active: ActiveDownload | null = null;
  /** Item shifted from the queue before `active` exists (resolver/transport gap). */
  private resolving: ResolvingDownload | null = null;
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

  /**
   * Append items to the in-memory queue while a session is already running.
   * De-dupes against the active transfer, resolving slot, and pending queue.
   * Does **not** resume a user-paused session (avoids restarting unrelated PFO work).
   */
  enqueueAdditional(items: DownloadQueueItem[]): void {
    if (items.length === 0) return;

    if (this.state === 'idle' || this.state === 'cancelled') {
      void this.start(items);
      return;
    }

    const known = new Set<string>(this.queue.map(item => item.id));
    if (this.active) {
      known.add(this.active.itemId);
    }
    if (this.resolving) {
      known.add(this.resolving.itemId);
    }
    const fresh = items.filter(item => !known.has(item.id));
    if (fresh.length === 0) return;
    this.queue.push(...fresh);
    log.info('Appended items to active download queue', {
      appended: fresh.length,
      state: this.state,
    });
  }

  /**
   * Drop pending queue rows and cancel the active/resolving transfer when it
   * matches. Leaves other queued work (e.g. PFO) intact. Used by draft
   * stage-exit purge.
   */
  async dropItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    const drop = new Set(itemIds);
    this.queue = this.queue.filter(item => !drop.has(item.id));

    if (this.resolving && drop.has(this.resolving.itemId)) {
      // Synchronous — processNext continuations observe this across awaits.
      this.resolving.cancelled = true;
    }

    const active = this.active;
    if (!active || !drop.has(active.itemId)) {
      return;
    }

    active.cancelled = true;
    const wasPaused = this.state === 'paused';
    const { itemId, resumable, savedPauseState } = active;
    try {
      if (wasPaused) {
        await markDownloadItemCancelled(itemId, savedPauseState);
      } else {
        try {
          const pauseState = await resumable.pauseAsync();
          await markDownloadItemCancelled(
            itemId,
            serializeDownloadState(pauseState),
          );
        } catch (error) {
          log.error('Failed to pause on dropItems', { error, itemId });
          await markDownloadItemCancelled(itemId, savedPauseState);
        }
      }
    } finally {
      this.active = null;
      if (this.state === 'cancelled') {
        this.state = 'idle';
        return;
      }
      if (this.state === 'paused') {
        // Stay paused — do not auto-resume remaining (possibly PFO) work.
        return;
      }
      if (this.state === 'downloading') {
        await this.processNext();
      }
    }
  }

  private isResolvingCancelled(itemId: string): boolean {
    return (
      this.resolving?.itemId === itemId && this.resolving.cancelled === true
    );
  }

  private clearResolvingIf(itemId: string): void {
    if (this.resolving?.itemId === itemId) {
      this.resolving = null;
    }
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
      // Waiting between items, or still resolving (transport/resolver await).
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
    // Claim the resume synchronously, before any await, so overlapping
    // NetInfo evaluations cannot both pass the `paused` guard and call
    // resumeAsync() twice on the same in-flight item.
    const reason = this.pauseReason;
    this.pauseReason = null;
    this.state = 'downloading';

    if (!(await this.transportAllows())) {
      // Roll back only if nothing else (cancel()/pause()) changed state while
      // the transport check was in flight.
      if (this.state === 'downloading') {
        this.pauseReason = reason;
        this.state = 'paused';
      }
      log.info('resume() skipped until transport allows transfer');
      return;
    }

    // cancel() or pause() ran while the transport check was in flight.
    if (this.state !== 'downloading') {
      return;
    }

    // Paused with no in-flight resumable (blocked before the next queued item).
    if (!this.active) {
      await this.processNext();
      return;
    }

    const activeAtStart = this.active;
    const { itemId, resumable } = activeAtStart;
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
    // ordering — see ActiveDownload.cancelled / ResolvingDownload.cancelled.
    if (active) {
      active.cancelled = true;
    }
    if (this.resolving) {
      this.resolving.cancelled = true;
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
      this.resolving = null;
      this.state = 'idle';
    }
  }

  /**
   * True when a text item carries its content inline as `serializedContent`
   * (Translation Notes/Words shipped in the manifest). Text items WITHOUT
   * inline content (e.g. commentary `.json` / `.pdf` members that only have a
   * `sourceUrl`) must go through the resolver/resumable-download path instead.
   * `typeof === 'string'` also rejects `null`, which SQLite-rehydrated queue
   * rows may carry for a missing column.
   */
  private hasInlineContent(item: DownloadQueueItem): boolean {
    return item.kind === 'text' && typeof item.serializedContent === 'string';
  }

  /**
   * After an await during resolve/setup: abort without recreating cache when
   * dropItems/cancel marked the shifted item cancelled; otherwise re-queue if
   * the session left `downloading`.
   */
  private async abandonResolvingItem(
    next: DownloadQueueItem,
  ): Promise<'aborted' | 'requeued' | 'continue'> {
    if (this.isResolvingCancelled(next.id)) {
      this.clearResolvingIf(next.id);
      if (this.state === 'downloading') {
        await this.processNext();
      }
      return 'aborted';
    }
    if (this.state !== 'downloading') {
      this.queue.unshift(next);
      this.clearResolvingIf(next.id);
      return 'requeued';
    }
    return 'continue';
  }

  /**
   * Text items with inline `serializedContent` in the manifest have no
   * sourceUrl to fetch. Write the content straight to disk and mark complete,
   * bypassing the resolver/resumable-download path (#51 / download-queue text
   * item bug). Text items with only a `sourceUrl` are NOT handled here — see
   * hasInlineContent() and processNext().
   */
  private async processTextItem(next: DownloadQueueItem): Promise<void> {
    try {
      if (next.serializedContent === undefined) {
        throw new Error(
          `No serializedContent configured for text item ${next.id}.`,
        );
      }
      await ensureDownloadsDir(next.projectId ?? 0);
      if ((await this.abandonResolvingItem(next)) !== 'continue') {
        return;
      }
      const destPath =
        next.localFilePath ??
        downloadResourcePath(
          next.projectId ?? 0,
          next.id,
          next.fileExt ?? 'json',
        );
      await markDownloadItemDownloading(next.id);
      if ((await this.abandonResolvingItem(next)) !== 'continue') {
        return;
      }
      await FileSystem.writeAsStringAsync(destPath, next.serializedContent);
      if ((await this.abandonResolvingItem(next)) !== 'continue') {
        return;
      }
      await this.handleItemComplete(next.id, destPath);
    } catch (error) {
      log.error('Failed to write text item', { error, itemId: next.id });
      if (this.isResolvingCancelled(next.id)) {
        this.clearResolvingIf(next.id);
        if (this.state === 'downloading') {
          await this.processNext();
        }
        return;
      }
      try {
        await markDownloadItemFailed(next.id);
      } catch (innerError) {
        log.error('Failed to mark item failed after text write error', {
          error: innerError,
          itemId: next.id,
        });
      }
      this.active = null;
      this.clearResolvingIf(next.id);
      await this.processNext();
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

    // Claim immediately so dropItems/enqueueAdditional see this id before
    // transport/resolver awaits assign `this.active`.
    this.resolving = { itemId: next.id, cancelled: false };

    if (!(await this.transportAllows())) {
      if (this.isResolvingCancelled(next.id)) {
        this.clearResolvingIf(next.id);
        if (this.state === 'downloading') {
          await this.processNext();
        }
        return;
      }
      log.info('Transport blocked before next download item; pausing queue', {
        itemId: next.id,
      });
      this.queue.unshift(next);
      this.clearResolvingIf(next.id);
      // Do not overwrite a concurrent user pause reason.
      if (this.state === 'downloading') {
        this.pauseReason = 'transport';
        this.state = 'paused';
      }
      return;
    }

    const afterTransport = await this.abandonResolvingItem(next);
    if (afterTransport !== 'continue') {
      return;
    }

    // Only inline-content text items are written directly. Text items that
    // only have a sourceUrl fall through to the resolver/resumable path below.
    if (this.hasInlineContent(next)) {
      await this.processTextItem(next);
      return;
    }

    let activeAtStart: ActiveDownload | undefined;
    try {
      const saved = parseDownloadState(next.resumeData);
      const { url, ext } = await this.resolver(next);

      const afterResolve = await this.abandonResolvingItem(next);
      if (afterResolve !== 'continue') {
        return;
      }

      await ensureDownloadsDir(next.projectId ?? 0);
      const afterDir = await this.abandonResolvingItem(next);
      if (afterDir !== 'continue') {
        return;
      }

      const destPath =
        saved?.fileUri ??
        next.localFilePath ??
        downloadResourcePath(next.projectId ?? 0, next.id, ext);

      // Prefer a freshly resolved URL so short-lived SAS links (#508 draft
      // audio, 15 min) can refresh on transfer/retry while resumeData + dest
      // path keep completed/partial bytes.
      const resumable = FileSystem.createDownloadResumable(
        url,
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

      const afterCreate = await this.abandonResolvingItem(next);
      if (afterCreate !== 'continue') {
        return;
      }

      activeAtStart = {
        itemId: next.id,
        resumable,
        cancelled: this.isResolvingCancelled(next.id),
      };
      this.active = activeAtStart;
      this.clearResolvingIf(next.id);
      if (activeAtStart.cancelled) {
        this.active = null;
        if (this.state === 'downloading') {
          await this.processNext();
        }
        return;
      }
      await markDownloadItemDownloading(next.id);
      if (activeAtStart.cancelled) {
        return;
      }
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
      const wasCancelled =
        activeAtStart?.cancelled === true || this.isResolvingCancelled(next.id);
      if (wasCancelled) {
        this.clearResolvingIf(next.id);
        // dropItems on active already advances; resolving-only cancel must.
        if (!activeAtStart && this.state === 'downloading') {
          await this.processNext();
        }
        return;
      }
      if (!(await this.transportAllows())) {
        if (this.isResolvingCancelled(next.id)) {
          this.clearResolvingIf(next.id);
          if (this.state === 'downloading') {
            await this.processNext();
          }
          return;
        }
        if (!activeAtStart) {
          this.queue.unshift(next);
          this.clearResolvingIf(next.id);
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
      this.clearResolvingIf(next.id);
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
    if (this.active?.itemId === itemId && this.active.cancelled === true) {
      return;
    }
    if (this.isResolvingCancelled(itemId)) {
      this.clearResolvingIf(itemId);
      if (this.state === 'downloading') {
        await this.processNext();
      }
      return;
    }
    const info = await FileSystem.getInfoAsync(uri);
    if (this.active?.itemId === itemId && this.active.cancelled === true) {
      // dropItems/cancel on active already advances the queue.
      return;
    }
    if (this.isResolvingCancelled(itemId)) {
      this.clearResolvingIf(itemId);
      if (this.state === 'downloading') {
        await this.processNext();
      }
      return;
    }
    await markDownloadItemCompleted(
      itemId,
      uri,
      info.exists ? info.size : undefined,
    );
    this.active = null;
    this.clearResolvingIf(itemId);
    await this.processNext();
  }
}
