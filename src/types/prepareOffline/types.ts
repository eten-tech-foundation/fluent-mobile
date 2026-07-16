export interface PrepareOfflineChapterRow {
  id: number;
  bookId: number;
  bookName: string;
  chapterNumber: number;
  assignedUserId: number | null;
}

export interface PrepareOfflineBookGroup {
  bookId: number;
  bookName: string;
  chapters: PrepareOfflineChapterRow[];
}
