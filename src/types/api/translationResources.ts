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
