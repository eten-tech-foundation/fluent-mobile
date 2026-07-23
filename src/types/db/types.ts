export interface Bible {
  id: number;
  languageId: number;
  name: string;
  abbreviation: string;
}

export interface Book {
  id: number;
  code: string;
  eng_display_name: string;
}

export interface Project {
  id: number;
  name: string;
  sourceLanguageId?: number;
  source_language_id?: number;
  source_language_name?: string;
  targetLanguageId?: number;
  target_language_id?: number;
  target_language_name: string;
  isActive?: boolean;
  status?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export type ProjectSyncState = 'none' | 'synced' | 'unsynced';

export type ChapterSyncState = 'none' | 'synced' | 'deviceOnly';

export type WorkflowBadgeStage =
  | 'not_started'
  | 'draft'
  | 'peer_check'
  | 'community_check'
  | 'advanced_check'
  | 'complete';

export interface MyWorkChapter {
  id: number;
  displayLabel: string;
  bookName: string;
  chapterNumber: number;
  workflowStage: WorkflowBadgeStage | null;
  syncState: ChapterSyncState;
  completedVerses: number;
  totalVerses: number;
  downloadedVerses: number;
  lastActivityAt?: string;
  lastActivityLabel?: string;
  projectName: string;
  targetLanguageName: string;
}

export interface ProjectChapter {
  id: number;
  displayLabel: string;
  bookName: string;
  chapterNumber: number;
  workflowStage: WorkflowBadgeStage | null;
  syncState: ChapterSyncState;
  completedVerses: number;
  totalVerses: number;
  downloadedVerses: number;
  lastActivityAt?: string;
  lastActivityLabel?: string;
}

export interface ProjectChapterRow {
  id: number;
  book_id: number;
  chapter_number: number;
  status: string;
  book_name: string;
  updated_at?: string | null;
  submitted_time?: string | null;
  last_recording_activity?: string | null;
  recording_count: number;
  pending_count: number;
  total_verses: number;
  completed_verses: number;
  downloaded_verses: number;
}

export interface MyWorkChapterRow {
  id: number;
  book_id: number;
  chapter_number: number;
  status: string;
  book_name: string;
  project_name: string;
  target_language_name: string;
  updated_at?: string | null;
  submitted_time?: string | null;
  recording_count: number;
  pending_count: number;
  last_recording_activity?: string | null;
  total_verses: number;
  completed_verses: number;
  downloaded_verses: number;
}

export interface ProjectSummary extends Project {
  chapterCount: number;
  syncState: ProjectSyncState;
  connectivityProfile: ConnectivityProfile | null;
}

/** Raw SQLite row shape for getProjectsWithSummary (snake_case columns). */
export interface ProjectSummaryRow {
  id: number;
  name: string;
  source_language_id: number;
  target_language_id: number;
  is_active: number;
  status: string;
  updated_at: string;
  metadata: string | null;
  source_language_name?: string;
  target_language_name: string;
  chapter_count: number;
  recording_count: number;
  pending_count: number;
}

export interface ChapterAssignment {
  chapterAssignmentId: number;
  projectUnitId: number;
  projectId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  assignedUserId?: number;
  peerCheckerId?: number;
  chapterStatus?: string;
  submittedTime?: string;
  updatedAt?: string;
  totalVerses?: number;
  completedVerses?: number;
}

export interface Verse {
  id?: number;
  bible_id: number;
  book_id: number;
  chapter_number: number;
  verse_number: number;
  text: string;
}

export interface BibleText {
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  verses: Verse[];
}

export interface ChapterAssignmentData {
  id: number;
  projectUnitId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  assignedUserId?: number;
  status: string;
  submittedTime?: string | null;
  updatedAt?: string;
  bookCode?: string;
  bookName?: string;
  bibleName?: string;
  bibleAbbreviation?: string;
}

export interface ChapterAssignmentRow {
  id: number;
  project_unit_id: number;
  bible_id: number;
  book_id: number;
  chapter_number: number;
  assigned_user_id?: number;
  status: string;
  submitted_time?: string | null;
  updated_at?: string;
  book_code?: string;
  book_name?: string;
  bible_name?: string;
  bible_abbreviation?: string;
}

export interface ChapterListItem {
  id: number;
  chapter_number: number;
  status: string;
  book_name: string;
  assigned_user_id?: number;
}

export interface ChapterRow {
  bible_id: number;
  book_id: number;
  chapter_number: number;
}

export interface CountRow {
  count: number;
}

export interface Language {
  id: number;
  langName: string;
  langNameLocalized?: string;
  langCode?: string;
  scriptDirection?: string;
}
export interface User {
  id: number;
  username?: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface UserRow {
  id: number;
  username?: string | null;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface VerseData {
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  verseNumber: number;
  text: string;
}

export interface VerseRow {
  bible_id: number;
  book_id: number;
  chapter_number: number;
  verse_number: number;
  text: string;
}

/** Local recording upload lifecycle (`recordings.sync_status`). */
export type RecordingSyncStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export interface Recording {
  id: string;
  bibleTextId: number;
  localFilePath: string;
  blobKey?: string | null;
  durationMs?: number | null;
  fileSizeBytes?: number | null;
  takeNumber: number;
  isLatest: boolean;
  syncStatus: RecordingSyncStatus;
  uploadError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingRow {
  id: string;
  bible_text_id: number;
  local_file_path: string;
  blob_key: string | null;
  duration_ms: number | null;
  file_size_bytes: number | null;
  take_number: number;
  is_latest: number;
  sync_status: RecordingSyncStatus;
  upload_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Latest non-uploaded recording row for the upload worker (#100).
 * `projectUnitId` comes from a matching `chapter_assignments` row.
 */
export interface PendingRecording {
  id: string;
  bibleTextId: number;
  localFilePath: string;
  durationMs: number | null;
  bookId: number;
  chapterNumber: number;
  /** Null when no chapter assignment maps this verse's chapter. */
  projectUnitId: number | null;
}

export const CHAPTER_ASSIGNMENT_STATUS = {
  not_started: 'Not Started',
  draft: 'Draft',
  peer_check: 'Peer Check',
  community_review: 'Community Review',
  linguist_check: 'Linguist Check',
  theological_check: 'Theological Check',
  consultant_check: 'Consultant Check',
  complete: 'Complete',
} as const;

export type ConnectivityProfile =
  | 'usually_connected'
  | 'sometimes_connected'
  | 'rarely_connected';
