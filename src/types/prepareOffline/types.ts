export interface PrepareOfflineChapterRow {
  id: number;
  bookId: number;
  bookCode: string;
  bookName: string;
  chapterNumber: number;
  assignedUserId: number | null;
}

export interface PrepareOfflineBookGroup {
  bookId: number;
  bookName: string;
  chapters: PrepareOfflineChapterRow[];
}

export interface PrepareOfflineProjectContext {
  projectId: number;
  sourceLanguageCode: string;
}

export type PrepareOfflineResourceTier = 1 | 2 | 3;

export type PrepareOfflineResourceKind = 'text' | 'audio' | 'image';

export interface PrepareOfflineResourceManifestItem {
  id: string;
  tier: PrepareOfflineResourceTier;
  kind: PrepareOfflineResourceKind;
  resourceName: string;
  label: string;
  required: boolean;
  removable: boolean;
  bytesTotal: number;
  sourceUrl?: string;
  fileExt: string;
  aquiferContentId?: number;
  aquiferBibleId?: number;
  languageCode: string;
  bookCode?: string;
  startChapter?: number;
  endChapter?: number;
  collectionCode?: string;
  resourceType?: string;
  serializedContent?: string;
}

export interface PrepareOfflineResourceManifest {
  projectId: number;
  sourceLanguageCode: string;
  items: PrepareOfflineResourceManifestItem[];
  totalBytes: number;
}
