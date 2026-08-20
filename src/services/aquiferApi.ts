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
  // Match fluent-web: api-key only. Aquifer rejects some GETs when
  // Content-Type: application/json is set (HTTP 400 "One or more errors occurred!").
  return {
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

const AQUIFER_REQUEST_TIMEOUT_MS = 30_000;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function aquiferRequest<T>(endpoint: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    AQUIFER_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${getAquiferApiBaseUrl()}${endpoint}`, {
      method: 'GET',
      headers: aquiferHeaders(),
      signal: controller.signal,
    });

    // Some RN/network failure modes resolve fetch without a Response.
    // Guard before reading `.ok` / `.status` so callers get ApiError, not a crash.
    if (response === undefined || response === null) {
      throw createNetworkApiError(
        new Error('Aquifer request returned no response'),
      );
    }

    if (!response.ok) {
      throw createApiError(response.status, await response.text());
    }

    const body = await response.text();
    return (body.trim() ? JSON.parse(body) : {}) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') {
      throw error;
    }
    if (isAbortError(error)) {
      throw createNetworkApiError(new Error('Aquifer request timed out'));
    }
    throw createNetworkApiError(error);
  } finally {
    clearTimeout(timeoutId);
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
