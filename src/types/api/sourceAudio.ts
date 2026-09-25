/**
 * Wire types for fluent-api source/reference audio (fluent-api #282 / #293).
 * Distinct from translator `/verse-audio` draft recordings.
 */

export type ApiSourceAudioProvider = 'dbl' | 'aquifer';

export type ApiSourceAudioFormat = 'mp3' | 'webm';

export type ApiSourceAudioScope = 'chapter' | 'verse';

export interface ApiSourceAudioItem {
  format: ApiSourceAudioFormat;
  url: string;
  sizeBytes?: number;
  scope: ApiSourceAudioScope;
  durationSeconds?: number;
  expiresAt?: number;
  dblAudioBibleId?: string;
}

export interface ApiSourceAudioVerseTimestamp {
  verse: number;
  startSeconds?: number;
  dblAudioBibleId?: string;
}

export interface ApiSourceAudioBible {
  aquiferBibleId?: number;
  dblAudioBibleId?: string;
  name: string;
  abbreviation: string;
  fluentBibleId?: number;
}

export interface ApiSourceAudioResponse {
  provider: ApiSourceAudioProvider;
  bible: ApiSourceAudioBible;
  bookCode: string;
  chapter: number;
  verse?: number;
  items: ApiSourceAudioItem[];
  verseTimestamps?: ApiSourceAudioVerseTimestamp[];
}

export interface GetChapterSourceAudioParams {
  projectId: number;
  bookCode: string;
  chapter: number;
  languageCode: string;
  bibleId: number;
  verse?: number;
}
export interface ApiSourceAudioManifestItem {
  id: string;
  tier: 1;
  kind: 'audio';
  resourceName: string;
  label: string;
  required: boolean;
  removable: boolean;
  bytesTotal: number;
  sourceUrl: string;
  fileExt: string;
  languageCode: string;
  bookCode: string;
  startChapter: number;
  endChapter: number;
  provider: ApiSourceAudioProvider;
  aquiferBibleId?: number;
}

export interface ApiSourceAudioManifestResponse {
  projectId: number;
  sourceLanguageCode: string;
  provider: ApiSourceAudioProvider;
  items: ApiSourceAudioManifestItem[];
  totalBytes: number;
}

export interface GetSourceAudioManifestParams {
  languageCode: string;
  bibleId: number;
  bookCode: string;
  startChapter: number;
  endChapter: number;
}
