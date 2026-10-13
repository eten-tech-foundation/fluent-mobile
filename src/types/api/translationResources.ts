/**
 * Wire types for fluent-api translation-resources (fluent-api #274 / #273).
 * Online Resources routes under `/projects/{projectId}/translation-resources/...`.
 */

/** TipTap / Aquifer content payload preserved as returned upstream. */
export type TranslationResourceTipTapContent = unknown;

export interface ApiTranslationNoteItem {
  id: number;
  name: string;
  localizedName: string;
  content: TranslationResourceTipTapContent;
}

export interface ApiTranslationNotesResponse {
  items: ApiTranslationNoteItem[];
}

export interface ApiTranslationQuestionItem {
  id: number;
  name: string;
  localizedName: string;
  content: TranslationResourceTipTapContent;
}

export interface ApiTranslationQuestionsResponse {
  items: ApiTranslationQuestionItem[];
}

export interface ApiTranslationImageItem {
  id: number;
  title: string;
  localizedName: string;
  url: string;
  thumbnailUrl?: string;
  size?: number;
}

export interface ApiTranslationImagesResponse {
  items: ApiTranslationImageItem[];
}

/**
 * Wire types for the Prepare Offline resource manifest endpoint (#504).
 * GET /projects/{projectId}/translation-resources/manifest
 */

export type ApiPrepareOfflineResourceTier = 1 | 2 | 3;

export type ApiPrepareOfflineResourceKind = 'text' | 'audio' | 'image';

/** Actual coverage of one resource, independent of the manifest request range. */
export interface ApiPrepareOfflineResourceScope {
  bookCode?: string;
  startChapter?: number;
  endChapter?: number;
  verseStart?: number;
  verseEnd?: number;
}

export interface ApiPrepareOfflineManifestItem {
  id: string;
  tier: ApiPrepareOfflineResourceTier;
  kind: ApiPrepareOfflineResourceKind;
  resourceName: string;
  label: string;
  required: boolean;
  removable: boolean;
  bytesTotal: number;
  sourceUrl?: string;
  fileExt: string;
  aquiferContentId?: number;
  languageCode: string;
  scope?: ApiPrepareOfflineResourceScope;
  /** Legacy scope fields; a multi-chapter range may be the request range. */
  bookCode?: string;
  startChapter?: number;
  endChapter?: number;
  collectionCode?: string;
  resourceType?: string;
  serializedContent?: string;
}

export interface ApiPrepareOfflineManifestResponse {
  projectId: number;
  sourceLanguageCode: string;
  items: ApiPrepareOfflineManifestItem[];
  totalBytes: number;
  truncated: boolean;
}
