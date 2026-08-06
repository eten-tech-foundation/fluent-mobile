export type AquiferResourceType =
  | 'None'
  | 'Guide'
  | 'Dictionary'
  | 'StudyNotes'
  | 'Images'
  | 'Videos';

export type AquiferResourceMediaType =
  | 'None'
  | 'Text'
  | 'Audio'
  | 'Video'
  | 'Image';

export interface AquiferLanguage {
  id: number;
  code: string;
  englishDisplay: string;
  localizedDisplay: string;
  scriptDirection: string;
}

export interface AquiferResourceCollection {
  code: string;
  displayName: string;
  shortName?: string;
  resourceType: AquiferResourceType;
  sliCategory?: string | null;
  sliLevel?: number | null;
}

export interface AquiferResourceSearchItem {
  id: number;
  name: string;
  localizedName: string;
  mediaType: AquiferResourceMediaType;
  languageCode: string;
  grouping: {
    type: AquiferResourceType;
    name: string;
    collectionTitle: string;
    collectionCode: string;
  };
}

export interface AquiferResourceSearchResponse {
  totalItemCount: number;
  returnedItemCount: number;
  offset: number;
  items: AquiferResourceSearchItem[];
}

export interface AquiferResourceDetails {
  id: number;
  referenceId: number;
  name: string;
  localizedName: string;
  content: unknown;
  grouping: {
    type: AquiferResourceType;
    name: string;
    mediaType: AquiferResourceMediaType | string;
    licenseInfo?: unknown;
  };
  language: {
    id: number;
    code: string;
    displayName: string;
    scriptDirection: string;
  };
}

export interface AquiferBible {
  id: number;
  name: string;
  abbreviation: string;
  languageId: number;
  languageCode?: string;
  isLanguageDefault?: boolean;
  hasAudio?: boolean;
}

export interface AquiferBibleTextResponse {
  bibleId: number;
  bibleName: string;
  bibleAbbreviation: string;
  bookName: string;
  bookCode: string;
  chapters: Array<{
    number: number;
    audio?: {
      webm?: AquiferMediaFile | null;
      mp3?: AquiferMediaFile | null;
    } | null;
    verses: Array<{
      number: number;
      text: string;
      audioTimestamp?: unknown;
    }>;
  }>;
}

export interface AquiferMediaFile {
  url: string;
  size: number;
}

export interface AquiferSearchResourcesParams {
  bookCode: string;
  startChapter: number;
  endChapter: number;
  languageCode: string;
  startVerse?: number;
  endVerse?: number;
  resourceType?: AquiferResourceType;
  resourceCollectionCode?: string;
  limit?: number;
  offset?: number;
}
