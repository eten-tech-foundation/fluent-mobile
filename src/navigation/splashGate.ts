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

export type SplashHideReason =
  | 'home:content'
  | 'home:empty'
  | 'home:error'
  | 'home:syncing'
  | 'home:blurred'
  | 'home:legacy'
  | 'auth'
  | 'init-error'
  | 'fallback';

let hideRequested = false;
let fallback: ReturnType<typeof setTimeout> | null = null;

/**
 * Takes the splash down once, when the first screen has something to show
 * in its place. Before this, the splash hid as soon as the session was
 * restored, 0.2–5 s before Home had content (measured on #971), which is
 * the blank the user saw.
 */
export function hideSplash(reason: SplashHideReason): void {
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

/** Test-only. */
export function __resetSplashGateForTests(): void {
  hideRequested = false;
  if (fallback !== null) {
    clearTimeout(fallback);
    fallback = null;
  }
}
