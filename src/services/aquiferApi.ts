import { getAquiferApiBaseUrl, getAquiferApiKey } from '../config/aquiferApi';
import type {
  AquiferBible,
  AquiferBibleTextResponse,
  AquiferLanguage,
  AquiferResourceCollection,
  AquiferResourceDetails,
  AquiferResourceSearchResponse,
  AquiferSearchResourcesParams,
} from '../types/api/aquifer';
import { createApiError, createNetworkApiError } from './apiError';

function aquiferHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-key': getAquiferApiKey(),
  };
}

function appendParams(
  params: URLSearchParams,
  entries: Record<string, string | number | undefined>,
): void {
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== '') {
      params.append(key, String(value));
    }
  }
}

async function aquiferRequest<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${getAquiferApiBaseUrl()}${endpoint}`, {
      method: 'GET',
      headers: aquiferHeaders(),
    });

    if (!response.ok) {
      throw createApiError(response.status, await response.text());
    }

    const body = await response.text();
    return (body.trim() ? JSON.parse(body) : {}) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') {
      throw error;
    }
    throw createNetworkApiError(error);
  }
}

function buildSearchEndpoint(params: AquiferSearchResourcesParams): string {
  const query = new URLSearchParams();
  appendParams(query, {
    BookCode: params.bookCode,
    StartChapter: params.startChapter,
    EndChapter: params.endChapter,
    LanguageCode: params.languageCode,
    StartVerse: params.startVerse,
    EndVerse: params.endVerse,
    ResourceType: params.resourceType,
    ResourceCollectionCode: params.resourceCollectionCode,
    Limit: params.limit ?? 100,
    Offset: params.offset,
  });
  return `/resources/search?${query.toString()}`;
}

export const AquiferAPI = {
  getLanguages: (): Promise<AquiferLanguage[]> =>
    aquiferRequest<AquiferLanguage[]>('/languages'),

  getResourceCollections: (): Promise<AquiferResourceCollection[]> =>
    aquiferRequest<AquiferResourceCollection[]>('/resources/collections'),

  searchResources: (
    params: AquiferSearchResourcesParams,
  ): Promise<AquiferResourceSearchResponse> =>
    aquiferRequest<AquiferResourceSearchResponse>(buildSearchEndpoint(params)),

  getResourceDetails: (contentId: number): Promise<AquiferResourceDetails> =>
    aquiferRequest<AquiferResourceDetails>(`/resources/${contentId}`),

  getBibles: (languageCode: string): Promise<AquiferBible[]> => {
    const query = new URLSearchParams({ languageCode });
    return aquiferRequest<AquiferBible[]>(`/bibles?${query.toString()}`);
  },

  getBibleText: (
    bibleId: number,
    bookCode: string,
    startChapter: number,
    endChapter: number,
  ): Promise<AquiferBibleTextResponse> => {
    const query = new URLSearchParams({
      BookCode: bookCode,
      StartChapter: String(startChapter),
      EndChapter: String(endChapter),
      shouldReturnAudioData: 'true',
    });
    return aquiferRequest<AquiferBibleTextResponse>(
      `/bibles/${bibleId}/texts?${query.toString()}`,
    );
  },
};
