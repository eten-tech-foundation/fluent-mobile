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
  projectUnitId?: number | null;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  assignedUserId?: number | null;
  peerCheckerId?: number | null;
  status?: string | null;
  submittedTime?: string | null;
  updatedAt?: string | null;
}
