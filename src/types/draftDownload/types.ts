import type {
  VerseAudioConflictStatus,
  VerseAudioGranularity,
} from '../api/verseAudio';
import type { TranslatedVerseMarkers } from '../api/translatedVerse';

export type DraftDownloadRole = 'observer' | 'peer_check';

/**
 * Manual-start request for #508 (observer) / #704 (peer_check).
 * MyWork owns row wiring; this module owns download orchestration only.
 */
export interface DraftDownloadRequest {
  chapterAssignmentId: number;
  projectUnitId: number;
  projectId: number;
  userId: number;
  bibleId: number;
  bookId: number;
  bookCode: string;
  chapterNumber: number;
  role: DraftDownloadRole;
}

export type DraftDownloadStatus =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'ready'
  | 'failed';

/** High-level phase for chip/progress; audio always precedes observer scripture. */
export type DraftDownloadPhase =
  | 'idle'
  | 'audio'
  | 'draft_text'
  | 'source_scripture'
  | 'complete';

export interface DraftDownloadState {
  chapterAssignmentId: number;
  role: DraftDownloadRole;
  status: DraftDownloadStatus;
  phase: DraftDownloadPhase;
  /** 0–1 aggregate across this chapter's expected draft queue items. */
  progress: number;
  /**
   * Wall-clock ms when status first became `ready`. Chip holds green for 10s
   * from this timestamp, then fades. Null when not ready.
   */
  readyAtMs: number | null;
  errorMessage?: string;
}

/** Selected-canonical coverage for Observer / peer-check consumers (API455+). */
export type DraftAudioGranularity = VerseAudioGranularity;

export interface DraftAudioCoverage {
  granularity: DraftAudioGranularity;
  startChapter: number | null;
  startVerse: number | null;
  endChapter: number | null;
  endVerse: number | null;
}

/**
 * One anchored recording unit exposed to the Observer owner for offline playback.
 * Stable identity: bibleTextId (shared anchor) + activeTakeId + contentHash.
 * Verse and pericope are take alternatives on the same anchor — not separate units.
 */
export interface DraftDownloadUnitAnchor {
  bibleTextId: number;
  verseNumber: number;
  markers: TranslatedVerseMarkers | null;
  /** Null when identity/metadata is missing — fail closed, no invented clean. */
  conflictStatus: VerseAudioConflictStatus | null;
  /** Null when identity/metadata is missing. */
  activeTakeId: number | null;
  contentHash: string | null;
  /**
   * Inclusive coverage from the exact active take (API455+).
   * Null when coverage keys were absent (older payload) or unit not selected.
   * Never invented.
   */
  coverage: DraftAudioCoverage | null;
  /** Null unless take/hash identity verified and local file exists. */
  localPlaybackUri: string | null;
  draftText: string | null;
}

/** Per-account observer source-scripture snapshot (not shared bible_texts). */
export interface DraftSourceScriptureSnapshot {
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  verses: Array<{ id: number; verseNumber: number; text: string }>;
  localFilePath: string;
}

/**
 * Typed integration contract for Observer / peer-check consumers.
 * Does not invent unresolved-conflict product UX — conflictStatus is passthrough.
 * Coverage is additive from selected-canonical API455 wire (exact active take).
 */
export interface DraftChapterLocalBundle {
  chapterAssignmentId: number;
  role: DraftDownloadRole;
  status: DraftDownloadState['status'];
  hasConflict: boolean;
  units: DraftDownloadUnitAnchor[];
  /** Observer-only local snapshot for render bridge; null for peer / missing. */
  sourceScripture: DraftSourceScriptureSnapshot | null;
}
