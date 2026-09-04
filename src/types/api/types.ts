export interface ApiVerse {
  verseNumber: number;
  text: string;
}

export interface ApiBook {
  bookId: number;
  chapterNumber: number;
  verses: ApiVerse[];
}

export interface ApiChapterAssignment {
  chapterAssignmentId: number;
  projectId: number;
  projectUnitId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  chapterStatus?: string;
  /** Field name on GET /users/:id/chapter-assignments/all */
  status?: string | null;
  assignedUserId?: number | null;
  peerCheckerId?: number | null;
  submittedTime?: string | null;
  updatedAt?: string | null;
  totalVerses?: number;
  completedVerses?: number;
  /** Chapter-level unresolved audio-take conflict rollup (fluent-api#271). */
  hasConflict?: boolean;
}

/** GET /users/:id/chapter-assignments — same shape web My Work uses. */
export interface ApiUserChapterAssignmentsByUser {
  assignedChapters: ApiChapterAssignment[];
  peerCheckChapters: ApiChapterAssignment[];
}

export interface ApiPericopeVerseRef {
  chapterNumber: number;
  verseNumber: number;
}

/** GET /projects/:id/pericopes/:bookCode/:chapter — one group per pericope. */
export interface ApiPericopeGroup {
  pericopeNumber: string;
  pericopeTitle: string | null;
  verses: ApiPericopeVerseRef[];
}
