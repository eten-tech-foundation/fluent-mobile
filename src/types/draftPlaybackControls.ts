/**
 * Draft review playback surfaced by the Record tab so Drafting can halt
 * audio on Back / leave without unmounting the tab (Bible/Resources keep
 * the native player alive).
 */
export interface DraftPlaybackControls {
  /** Stop the take and clear loaded/playing ids. Safe to call when idle. */
  stopPlayback: () => Promise<void>;
}
