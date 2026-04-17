export interface ApiVerse {
  verseNumber: number;
  text: string;
}

export interface ApiBook {
  bookId: number;
  chapterNumber: number;
  verses: ApiVerse[];
}
