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
  source_language_name?: string;
  targetLanguageId?: number;
  target_language_name: string;
  isActive?: boolean;
  status?: string;
  updatedAt?: string;
}

export interface ChapterAssignment {
  chapterAssignmentId: number;
  projectUnitId: number;
  projectId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  assignedUserId?: number;
  chapterStatus?: string;
  submittedTime?: string;
  updatedAt?: string;
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
