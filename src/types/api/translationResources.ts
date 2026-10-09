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

/** Aquifer / fluent-api license blob — used for Images & Maps attribution (#594). */
export interface ApiTranslationImageLicenseInfo {
  title?: string;
  copyright?: {
    dates?: string;
    holder?: { name?: string; url?: string };
  };
  licenses?: Array<Record<string, { name?: string; url?: string }>>;
}

export interface ApiTranslationImageItem {
  id: number;
  title: string;
  localizedName: string;
  url: string;
  thumbnailUrl?: string;
  size?: number;
  /** Optional caption under the title (fluent-api / Aquifer). */
  caption?: string;
  /** Prefers explicit attribution; otherwise derived from licenseInfo (#594). */
  attribution?: string;
  /** Opaque until fluent-api stabilizes the shape; parser narrows when object-like. */
  licenseInfo?: unknown;
}

export interface ApiTranslationImagesResponse {
  items: ApiTranslationImageItem[];
}
