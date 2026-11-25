import BootSplash from 'react-native-bootsplash';
import { logger } from '../utils/logger';
import { markStartup } from '../utils/startupTrace';

const log = logger.create('SplashGate');

/**
 * Longest the splash stays up after the session is known. The first screen
 * normally reports its paint well inside this; the bound only keeps a path
 * that never reports from leaving the splash up (#972).
 */
export const SPLASH_FALLBACK_MS = 3000;

/**
 * Longest the in-app launch overlay stays up with no paint report. The native
 * splash falls back sooner (#972); this only stops a missing report from
 * covering the app for the rest of the session (#1000).
 */
export const LAUNCH_OVERLAY_CAP_MS = 20_000;

/** When the overlay copy switches from "Loading your work…" to "Still loading…". */
export const LAUNCH_OVERLAY_STILL_MS = 4_000;

export type SplashHideReason =
  | 'home:content'
  | 'home:empty'
  | 'home:error'
  | 'home:syncing'
  | 'home:blurred'
  | 'home:legacy'
  | 'auth'
  | 'sync'
  | 'init-error'
  | 'fallback';

let hideRequested = false;
let fallback: ReturnType<typeof setTimeout> | null = null;
let firstPaintReported = false;
let overlayCap: ReturnType<typeof setTimeout> | null = null;
const overlayListeners = new Set<() => void>();
const firstPaintQueue: Array<() => void> = [];

function emitOverlay(): void {
  for (const listener of overlayListeners) listener();
}

/** True until a screen reports a real paint, or the hard cap fires. */
export function isLaunchOverlayVisible(): boolean {
  return !firstPaintReported;
}

export function subscribeLaunchOverlay(listener: () => void): () => void {
  overlayListeners.add(listener);
  return () => {
    overlayListeners.delete(listener);
  };
}

function clearOverlayCap(): void {
  if (overlayCap !== null) {
    clearTimeout(overlayCap);
    overlayCap = null;
  }
}

function reportFirstPaint(): void {
  if (firstPaintReported) return;
  firstPaintReported = true;
  clearOverlayCap();
  emitOverlay();
  flushFirstPaintQueue();
}

function flushFirstPaintQueue(): void {
  const pending = firstPaintQueue.splice(0);
  for (const run of pending) {
    try {
      run();
    } catch (error) {
      log.error('Deferred post-paint work failed', { error: String(error) });
    }
  }
}

/**
 * Runs `fn` once the first screen has painted, or when the overlay cap gives
 * up waiting for a paint report. If a paint was already reported, runs now.
 * Keeps background work (sync, upload, sync-status reads) off the single
 * SQLite connection while Home is still assembling its first frame (#1002).
 */
export function afterFirstPaint(fn: () => void): void {
  if (firstPaintReported) {
    fn();
    return;
  }
  firstPaintQueue.push(fn);
}

function armOverlayCap(): void {
  clearOverlayCap();
  overlayCap = setTimeout(() => {
    overlayCap = null;
    if (firstPaintReported) return;
    log.warn(
      'No screen reported a paint; clearing the launch overlay on the cap',
    );
    reportFirstPaint();
  }, LAUNCH_OVERLAY_CAP_MS);
}

/**
 * Takes the splash down once, when the first screen has something to show
 * in its place. Before this, the splash hid as soon as the session was
 * restored, 0.2–5 s before Home had content (measured on #971), which is
 * the blank the user saw.
 */
export function hideSplash(reason: SplashHideReason): void {
  // A real paint still clears the overlay after the native fallback already
  // hid the splash. The fallback itself must not: nothing is committed yet.
  // Home blurring means a screen was pushed over it; that screen reports its
  // own paint, so Home's blur must not clear the overlay early.
  if (reason !== 'fallback' && reason !== 'home:blurred') reportFirstPaint();
  if (hideRequested) return;
  hideRequested = true;
  if (fallback !== null) {
    clearTimeout(fallback);
    fallback = null;
  }
  markStartup('splash_hide_requested', { reason });
  // No fade: it opens a second splash window on the UI thread while the
  // first screen is mounting, holding saved content back on every cold launch.
  BootSplash.hide()
    .then(() => markStartup('splash_hidden'))
    .catch(e => {
      log.error('BootSplash hide failed', { error: String(e) });
    });
}

/**
 * Session known: keep the splash up for the first screen's paint, but no
 * longer than `SPLASH_FALLBACK_MS`.
 */
export function holdSplashForFirstPaint(): void {
  if (hideRequested || fallback !== null) return;
  fallback = setTimeout(() => {
    fallback = null;
    log.warn('No screen reported a paint; hiding the splash on the fallback');
    hideSplash('fallback');
  }, SPLASH_FALLBACK_MS);
}

/**
 * App root mounted: a splash is up that this gate has not hidden. The JS
 * runtime can outlive the activity (the upload service keeps the process
 * alive after the app is swiped away), and the next activity shows a new
 * splash, so the gate's state from the last one must not carry over.
 */
export function armSplashGate(): void {
  hideRequested = false;
  firstPaintReported = false;
  // Queued work from the last activity still waits for the next paint.
  if (fallback !== null) {
    clearTimeout(fallback);
    fallback = null;
  }
  armOverlayCap();
  emitOverlay();
}

/** Test-only. Also drops work queued by `afterFirstPaint`. */
export function __resetSplashGateForTests(): void {
  firstPaintQueue.length = 0;
  armSplashGate();
}
