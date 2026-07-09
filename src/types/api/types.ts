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
  totalVerses: number;
  completedVerses: number;
}
