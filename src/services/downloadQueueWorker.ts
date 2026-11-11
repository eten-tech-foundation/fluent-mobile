import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';
import { downloadResourcePath, ensureDownloadsDir } from './downloadStorage';
import {
  clearDownloadItemResumeState,
  markDownloadItemCancelled,
  markDownloadItemCompleted,
  markDownloadItemFailed,
  markDownloadItemPaused,
  updateDownloadItemProgress,
} from '../db/downloadQueueRepository';
import type { DownloadQueueItem } from '../types/download/types';
import { markDownloadItemDownloading } from '../db/downloadQueueRepository';
import {
  validateDownloadResult,
  type DownloadValidationOutcome,
} from './downloadResultValidation';
import { isSha256Hex, sha256File } from './fileSha256';
import { DRAFT_DOWNLOAD_RESOURCE_NAME } from './draftDownloadIds';

const log = logger.create('DownloadQueueWorker');

/** Expo FS pauseAsync when the native resumable is already gone (benign on cancel). */
export function isMissingNativeDownloadObjectError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : '';
  return /No download object available/i.test(message);
}

export type WorkerSessionState =
  | 'idle'
  | 'downloading'
  | 'paused'
  | 'cancelled';

/** Distinguishes intentional UI pause from transport-loss pause (#619). */
export type DownloadPauseReason = 'user' | 'transport';

export type ResourceResolver = (
  item: DownloadQueueItem,
  /** Aborted by worker pause/cancel/drop while the resolver is in flight (#886). */
  options?: { signal?: AbortSignal; forceRefresh?: boolean },
) => Promise<{ url: string; ext: string }>;

/** Returns true when Wi-Fi / cellular policy allows a transfer (#546 / #619). */
export type TransportAllowsFn = () => Promise<boolean>;

type ActiveDownload = {
  itemId: string;
  /** Queue row as shifted — re-queued verbatim (minus resume state) on a clean restart. */
  item: DownloadQueueItem;
  destPath: string;
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
  /**
   * Aborts the resolver's HTTP work (URL refresh) on pause/cancel/drop so the
   * worker does not wait for the 30 s transport timeout to acknowledge
   * (#886). `cancelled` says *why*; a pause leaves it false and re-queues.
   */
  abort: AbortController;
};

/**
 * How many clean restarts (delete partial bytes, re-resolve URL, download
 * from scratch) one item gets per worker session before it is marked failed.
 * One covers the common cases — expired signed URL, Range ignored once — and
 * bounds the loop a persistently wrong object would otherwise cause.
 */
export const MAX_DOWNLOAD_RESTARTS_PER_ITEM = 1;

type TransferEvidence = {
  resumed: boolean;
  resumeOffset?: number;
  result: FileSystem.FileSystemDownloadResult;
};

/**
 * `bytesTotal` is only an exact byte count for draft takes (server computes
 * `sizeBytes` from the uploaded body). Source Bible / Aquifer sizes come from
 * upstream catalogue metadata (advisory, `0` when unknown) and must not be
 * enforced against the CDN response.
 */
function exactExpectedBytes(item: DownloadQueueItem): number | undefined {
  if (item.resourceName !== DRAFT_DOWNLOAD_RESOURCE_NAME) return undefined;
  return typeof item.bytesTotal === 'number' && item.bytesTotal > 0
    ? item.bytesTotal
    : undefined;
}

export class DownloadQueueWorker {
  private state: WorkerSessionState = 'idle';
  /**
   * Clean restarts already spent per item id in this session. The
   * worker is an app-lifetime singleton, so the budget is reset whenever a
   * new session starts and cleared for an item once it completes.
   */
  private restarts = new Map<string, number>();
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
    this.restarts.clear();
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
    // Cancelled resolving slots must not block re-enqueue of the same id
    // (draft text re-download after removeStaleDraftRows).
    if (this.resolving && !this.resolving.cancelled) {
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
      this.resolving.abort.abort();
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
        // Do not await the rest of the queue — dropItems callers (e.g. draft
        // re-download) must not block on unrelated PFO work.
        void this.processNext();
      }
    }
  }

  /** Cancelled flag on this claim object — not the current `this.resolving` slot. */
  private isResolvingCancelled(claim: ResolvingDownload): boolean {
    return claim.cancelled;
  }

  /** Clear the shared slot only when it still references this claim. */
  private clearResolving(claim: ResolvingDownload): void {
    if (this.resolving === claim) {
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
      // Stop an in-flight URL refresh now; processNext re-queues the item.
      this.resolving?.abort.abort();
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
      // A URL refresh aborted by pause() may still be unwinding. Its catch
      // re-queues the item and drives processNext once it sees state is
      // 'downloading' again; starting a second pass here would race it and
      // could leave the re-queued item behind in an idle worker (#886).
      // Resolvers must settle (honour the signal or stay bounded — the draft
      // listing has the 30 s HTTP timeout, sourceUrl items resolve inline).
      if (this.resolving) {
        return;
      }
      await this.processNext();
      return;
    }

    const activeAtStart = this.active;
    const { itemId, resumable } = activeAtStart;
    try {
      await markDownloadItemDownloading(itemId);
      const resumeOffset = await this.localFileSize(activeAtStart.destPath);
      if (
        activeAtStart.cancelled ||
        this.active !== activeAtStart ||
        this.state !== 'downloading'
      ) {
        return;
      }
      const result = await resumable.resumeAsync();

      // A concurrent cancel() may have run while resumeAsync() was in
      // flight. cancel() flips `this.state` to 'idle' once it finishes, so
      // that check alone can lose the race — check the flag cancel() set
      // synchronously on this specific download instead.
      if (activeAtStart.cancelled) {
        return;
      }

      if (result) {
        await this.handleItemComplete(itemId, result.uri, undefined, {
          resumed: true,
          resumeOffset,
          result,
        });
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
    const resolvingClaim = this.resolving;

    // Set synchronously, before any await, so a racing
    // processNext()/resume() continuation always observes it regardless of
    // ordering — see ActiveDownload.cancelled / ResolvingDownload.cancelled.
    if (active) {
      active.cancelled = true;
    }
    if (resolvingClaim) {
      resolvingClaim.cancelled = true;
      resolvingClaim.abort.abort();
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
            if (isMissingNativeDownloadObjectError(error)) {
              // Native object already released — cancel still succeeds; retain
              // any previously saved pause state for resume. Do not elevate.
              log.info(
                'Pause skipped on cancel; native download object already gone',
                {
                  itemId,
                  error,
                },
              );
            } else {
              log.error('Failed to pause on cancel', { error, itemId });
            }
            await markDownloadItemCancelled(itemId, savedPauseState);
          }
        }
      }
    } finally {
      this.active = null;
      // Do not clear a newer claim installed while cancel awaited.
      if (resolvingClaim) {
        this.clearResolving(resolvingClaim);
      }
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
    claim: ResolvingDownload,
  ): Promise<'aborted' | 'requeued' | 'continue'> {
    if (this.isResolvingCancelled(claim)) {
      this.clearResolving(claim);
      if (this.state === 'downloading') {
        await this.processNext();
      }
      return 'aborted';
    }
    if (this.state !== 'downloading') {
      this.queue.unshift(next);
      this.clearResolving(claim);
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
  private async processTextItem(
    next: DownloadQueueItem,
    claim: ResolvingDownload,
  ): Promise<void> {
    try {
      if (next.serializedContent === undefined) {
        throw new Error(
          `No serializedContent configured for text item ${next.id}.`,
        );
      }
      await ensureDownloadsDir(next.projectId ?? 0);
      if ((await this.abandonResolvingItem(next, claim)) !== 'continue') {
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
      if ((await this.abandonResolvingItem(next, claim)) !== 'continue') {
        return;
      }
      await FileSystem.writeAsStringAsync(destPath, next.serializedContent);
      if ((await this.abandonResolvingItem(next, claim)) !== 'continue') {
        return;
      }
      await this.handleItemComplete(next.id, destPath, claim);
    } catch (error) {
      log.error('Failed to write text item', { error, itemId: next.id });
      if (this.isResolvingCancelled(claim)) {
        this.clearResolving(claim);
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
      this.clearResolving(claim);
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
    // transport/resolver awaits assign `this.active`. Track by object identity
    // so a cancelled claim cannot clear/cancel a newer claim for the same id.
    const claim: ResolvingDownload = {
      itemId: next.id,
      cancelled: false,
      abort: new AbortController(),
    };
    this.resolving = claim;

    if (!(await this.transportAllows())) {
      if (this.isResolvingCancelled(claim)) {
        this.clearResolving(claim);
        if (this.state === 'downloading') {
          await this.processNext();
        }
        return;
      }
      log.info('Transport blocked before next download item; pausing queue', {
        itemId: next.id,
      });
      this.queue.unshift(next);
      this.clearResolving(claim);
      // Do not overwrite a concurrent user pause reason.
      if (this.state === 'downloading') {
        this.pauseReason = 'transport';
        this.state = 'paused';
      }
      return;
    }

    const afterTransport = await this.abandonResolvingItem(next, claim);
    if (afterTransport !== 'continue') {
      return;
    }

    // Only inline-content text items are written directly. Text items that
    // only have a sourceUrl fall through to the resolver/resumable path below.
    if (this.hasInlineContent(next)) {
      await this.processTextItem(next, claim);
      return;
    }

    let activeAtStart: ActiveDownload | undefined;
    try {
      const saved = parseDownloadState(next.resumeData);
      const { url, ext } = await this.resolver(next, {
        signal: claim.abort.signal,
        ...(this.restarts.has(next.id) ? { forceRefresh: true } : {}),
      });

      const afterResolve = await this.abandonResolvingItem(next, claim);
      if (afterResolve !== 'continue') {
        return;
      }

      await ensureDownloadsDir(next.projectId ?? 0);
      const afterDir = await this.abandonResolvingItem(next, claim);
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
        // md5 of the final file lets us check an S3 single-part ETag /
        // Content-MD5 when the server exposes one.
        saved?.options ?? { md5: true },
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

      const afterCreate = await this.abandonResolvingItem(next, claim);
      if (afterCreate !== 'continue') {
        return;
      }

      activeAtStart = {
        itemId: next.id,
        item: next,
        destPath,
        resumable,
        cancelled: this.isResolvingCancelled(claim),
      };
      this.active = activeAtStart;
      this.clearResolving(claim);
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
      // Offset Expo will request (`Range: bytes=<file length>-`); validated
      // against the 206 Content-Range so a server that ignored Range, or an
      // object that changed size, cannot publish a corrupt file.
      const resumeOffset = shouldResume
        ? await this.localFileSize(destPath)
        : undefined;
      if (
        activeAtStart.cancelled ||
        this.active !== activeAtStart ||
        this.state !== 'downloading'
      ) {
        return;
      }
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
        await this.handleItemComplete(next.id, result.uri, claim, {
          resumed: shouldResume,
          resumeOffset,
          result,
        });
      }
    } catch (error) {
      const wasCancelled =
        activeAtStart?.cancelled === true || this.isResolvingCancelled(claim);
      const pausedDuringResolve =
        !wasCancelled && !activeAtStart && claim.abort.signal.aborted;
      if (pausedDuringResolve) {
        log.info('Download URL refresh aborted by pause; item re-queued', {
          itemId: next.id,
        });
      } else {
        log.error('Failed to download item', { error, itemId: next.id });
      }
      if (wasCancelled) {
        this.clearResolving(claim);
        // dropItems on active already advances; resolving-only cancel must.
        if (!activeAtStart && this.state === 'downloading') {
          await this.processNext();
        }
        return;
      }
      // pause() aborted the resolver (not a cancel): the item is still wanted,
      // re-queue it instead of marking it failed (#886).
      if (pausedDuringResolve) {
        this.queue.unshift(next);
        this.clearResolving(claim);
        // resume() may already have run and deferred to this claim; keep the
        // queue moving if nothing else owns it.
        if (this.state === 'downloading' && !this.active && !this.resolving) {
          await this.processNext();
        }
        return;
      }
      if (!(await this.transportAllows())) {
        if (this.isResolvingCancelled(claim)) {
          this.clearResolving(claim);
          if (this.state === 'downloading') {
            await this.processNext();
          }
          return;
        }
        if (!activeAtStart) {
          this.queue.unshift(next);
          this.clearResolving(claim);
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
      this.clearResolving(claim);
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

  private async localFileSize(uri: string): Promise<number | undefined> {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists ? info.size : undefined;
    } catch (error) {
      log.warn('Could not stat download destination', { error, uri });
      return undefined;
    }
  }

  /**
   * Handle a rejected transfer result. `restart`: delete the
   * untrustworthy bytes, clear persisted resume state and put the item back
   * at the head of the queue so the next pass re-resolves a fresh URL and
   * downloads from scratch — bounded by MAX_DOWNLOAD_RESTARTS_PER_ITEM, beyond
   * which the item is marked failed. `fail`: delete the bytes and mark failed
   * without spending a restart.
   *
   * Re-checks cancellation after every await: cancel()/dropItems() may have
   * marked the row cancelled or purged it meanwhile, in which case nothing
   * may be written, re-queued or advanced here (those paths already advance
   * the queue).
   */
  private async restartOrFail(
    active: ActiveDownload,
    outcome: Extract<DownloadValidationOutcome, { ok: false }>,
    claim?: ResolvingDownload,
  ): Promise<void> {
    const { itemId, destPath: uri, item } = active;
    const spent = this.restarts.get(itemId) ?? 0;
    const canRestart =
      outcome.action === 'restart' && spent < MAX_DOWNLOAD_RESTARTS_PER_ITEM;
    log.warn('Download result rejected', {
      itemId,
      reason: `${outcome.action}: ${outcome.reason}`,
      restartsSpent: spent,
      willRestart: canRestart,
    });
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (error) {
      log.warn('Failed to delete rejected download bytes', { error, itemId });
    }
    if (this.isSuperseded(active, claim)) return;

    if (canRestart) {
      this.restarts.set(itemId, spent + 1);
      try {
        await clearDownloadItemResumeState(itemId);
      } catch (error) {
        log.error('Failed to clear resume state before restart', {
          error,
          itemId,
        });
      }
      if (this.isSuperseded(active, claim)) return;
      this.queue.unshift({
        ...item,
        resumeData: undefined,
        progress: 0,
        status: 'queued',
      });
    } else {
      try {
        await markDownloadItemFailed(itemId);
      } catch (error) {
        log.error('Failed to mark rejected download as failed', {
          error,
          itemId,
        });
      }
      if (this.isSuperseded(active, claim)) return;
    }
    this.active = null;
    if (claim) {
      this.clearResolving(claim);
    }
    await this.processNext();
  }

  /**
   * True when cancel()/dropItems() took over this transfer while we were
   * awaiting: the active slot was cancelled or replaced, or the resolving
   * claim was cancelled. Callers must then return without touching queue,
   * DB or `processNext`.
   */
  private isSuperseded(
    active: ActiveDownload,
    claim?: ResolvingDownload,
  ): boolean {
    if (active.cancelled || this.active !== active) return true;
    if (claim && this.isResolvingCancelled(claim)) {
      this.clearResolving(claim);
      return true;
    }
    return false;
  }

  private async handleItemComplete(
    itemId: string,
    uri: string,
    claim?: ResolvingDownload,
    evidence?: TransferEvidence,
  ): Promise<void> {
    if (this.active?.itemId === itemId && this.active.cancelled === true) {
      return;
    }
    if (claim && this.isResolvingCancelled(claim)) {
      this.clearResolving(claim);
      if (this.state === 'downloading') {
        await this.processNext();
      }
      return;
    }
    const fileSize = await this.localFileSize(uri);
    if (this.active?.itemId === itemId && this.active.cancelled === true) {
      // dropItems/cancel on active already advances the queue.
      return;
    }
    if (claim && this.isResolvingCancelled(claim)) {
      this.clearResolving(claim);
      if (this.state === 'downloading') {
        await this.processNext();
      }
      return;
    }

    const active = this.active?.itemId === itemId ? this.active : undefined;
    let finalBytes = fileSize;
    if (evidence && active) {
      const outcome = validateDownloadResult({
        status: evidence.result.status,
        headers: evidence.result.headers,
        resumed: evidence.resumed,
        resumeOffset: evidence.resumeOffset,
        expectedTotalBytes: exactExpectedBytes(active.item),
        fileSize,
        fileMd5: evidence.result.md5,
        kind: active.item.kind,
      });
      if (!outcome.ok) {
        await this.restartOrFail(active, outcome, claim);
        return;
      }
      finalBytes = outcome.finalBytes;
    } else if (fileSize === undefined || fileSize === 0) {
      // Inline text write produced nothing — never publish an empty file.
      // There is no network transfer to restart; mark failed so the user can
      // retry instead of consuming the empty file.
      log.warn('Download result rejected', {
        itemId,
        reason: 'fail: empty local write',
      });
      try {
        await markDownloadItemFailed(itemId);
      } catch (error) {
        log.error('Failed to mark empty download as failed', { error, itemId });
      }
      if (claim) {
        this.clearResolving(claim);
      }
      if (this.state === 'downloading') {
        await this.processNext();
      }
      return;
    }

    if (active) {
      let expectedHash: unknown;
      try {
        const metadata = JSON.parse(
          active.item.serializedContent ?? '{}',
        ) as Record<string, unknown>;
        expectedHash = metadata.expectedContentHash;
      } catch {
        // Non-draft/legacy queue entries need not carry a digest.
      }
      if (isSha256Hex(expectedHash)) {
        try {
          const actualHash = await sha256File(uri, {
            size: finalBytes,
            shouldAbort: () => this.isSuperseded(active, claim),
          });
          if (this.isSuperseded(active, claim)) return;
          if (actualHash !== expectedHash.toLowerCase()) {
            await this.restartOrFail(
              active,
              {
                ok: false,
                action: 'restart',
                reason: 'audio content hash mismatch',
              },
              claim,
            );
            return;
          }
        } catch {
          if (this.isSuperseded(active, claim)) return;
          await this.restartOrFail(
            active,
            {
              ok: false,
              action: 'fail',
              reason: 'audio content hash could not be verified',
            },
            claim,
          );
          return;
        }
      }
    }
    if (active && this.isSuperseded(active, claim)) return;
    await markDownloadItemCompleted(itemId, uri, finalBytes);
    this.restarts.delete(itemId);
    this.active = null;
    if (claim) {
      this.clearResolving(claim);
    }
    await this.processNext();
  }
}
