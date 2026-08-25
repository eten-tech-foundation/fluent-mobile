import {
  ApiBible,
  ApiBookMeta,
  ApiLanguage,
  ApiUser,
  BibleTextsResponse,
  ChapterAssignmentsResponse,
  ForgotPasswordResponse,
  SignInResponse,
  SignOutResponse,
  UserChapterAssignmentsResponse,
  UserProjectsResponse,
} from '../types/api/responses';
import type {
  ApiTranslationImagesResponse,
  ApiTranslationNotesResponse,
  ApiTranslationQuestionsResponse,
} from '../types/api/translationResources';
import type {
  UploadVerseAudioParams,
  VerseAudioResponse,
} from '../types/api/verseAudio';
import { checkServerReachable } from './connectivity';
import {
  authedMultipartRequest,
  authedRequest,
  publicRequest,
  publicRequestWithResponse,
} from './httpClient';
import { resolveSessionToken } from './sessionToken';
import { createApiError } from './apiError';
import { parseVerseAudioResponse } from './verseAudioContract';
import {
  buildVerseAudioFormData,
  verseAudioUploadPath,
} from './verseAudioFormData';

function translationResourcesVersePath(
  projectId: number,
  kind: 'notes' | 'questions' | 'images',
  bookCode: string,
  chapter: number,
  verse: number,
  languageCode: string,
): string {
  const params = new URLSearchParams({ languageCode });
  return `/projects/${projectId}/translation-resources/${kind}/${encodeURIComponent(
    bookCode,
  )}/${chapter}/${verse}?${params.toString()}`;
}

const MOBILE_HEADERS = {
  'x-client-type': 'mobile',
  'User-Agent': 'fluent-mobile',
};

async function signInRequest(
  email: string,
  password: string,
): Promise<SignInResponse> {
  const { data, response } = await publicRequestWithResponse<
    Omit<SignInResponse, 'token'> & { token?: string }
  >('/api/auth/sign-in/email', {
    method: 'POST',
    headers: MOBILE_HEADERS,
    body: JSON.stringify({ email, password }),
  });

  const token = resolveSessionToken(
    response.headers.get('set-auth-token'),
    data.token,
  );

  if (!token) {
    throw createApiError(
      500,
      'Sign-in succeeded but no session token was returned',
    );
  }

  return { ...data, token };
}

async function uploadVerseAudioRequest(
  params: UploadVerseAudioParams,
): Promise<VerseAudioResponse> {
  const formData = await buildVerseAudioFormData(params);
  const raw = await authedMultipartRequest<unknown>(
    verseAudioUploadPath(params.projectUnitId, params.bibleTextId),
    formData,
    { method: 'PUT' },
  );
  return parseVerseAudioResponse(raw);
}

export const FluentAPI = {
  checkServerReachable,

  signIn: (email: string, password: string): Promise<SignInResponse> =>
    signInRequest(email, password),

  forgotPassword: (email: string): Promise<ForgotPasswordResponse> =>
    publicRequest<ForgotPasswordResponse>('/api/auth/forget-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: MOBILE_HEADERS,
    }),

  signOut: (): Promise<SignOutResponse> =>
    authedRequest<SignOutResponse>('/api/auth/sign-out', {
      method: 'POST',
      headers: MOBILE_HEADERS,
    }),

  getLanguages: (): Promise<ApiLanguage[]> =>
    publicRequest<ApiLanguage[]>('/languages'),

  getBooks: (): Promise<ApiBookMeta[]> =>
    publicRequest<ApiBookMeta[]>('/books'),

  getBibles: (): Promise<ApiBible[]> => publicRequest<ApiBible[]>('/bibles'),

  getUserByEmail: (email: string): Promise<ApiUser> =>
    authedRequest<ApiUser>(`/users/email/${encodeURIComponent(email)}`),

  getUserProjects: (userId: number): Promise<UserProjectsResponse> =>
    authedRequest<UserProjectsResponse>(`/users/${userId}/projects`),

  getChapterAssignments: (
    userId: number,
    updatedAfter?: string,
    excludeProjectIds?: number[],
  ): Promise<ChapterAssignmentsResponse> => {
    const params = new URLSearchParams();
    if (updatedAfter) params.append('updatedAfter', updatedAfter);
    if (excludeProjectIds?.length) {
      params.append('excludeProjectIds', excludeProjectIds.join(','));
    }
    const query = params.toString();
    return authedRequest<ChapterAssignmentsResponse>(
      `/users/${userId}/chapter-assignments/all${query ? `?${query}` : ''}`,
    );
  },

  /** Role-filtered assignments — matches web My Work / My History. */
  getUserChapterAssignments: (
    userId: number,
  ): Promise<UserChapterAssignmentsResponse> =>
    authedRequest<UserChapterAssignmentsResponse>(
      `/users/${userId}/chapter-assignments`,
    ),

  getBibleTexts: (
    bibleId: number,
    chapters: Array<{ bookId: number; chapterNumber: number }>,
    updatedAfter?: string,
  ): Promise<BibleTextsResponse> =>
    publicRequest<BibleTextsResponse>(`/bibles/${bibleId}/bulk-texts`, {
      method: 'POST',
      body: JSON.stringify({ chapters, ...(updatedAfter && { updatedAfter }) }),
    }),

  /**
   * Upload or replace one verse recording (Azure Blob via Fluent API).
   * Contract: docs/guides/recordings-sync-contract.md (#102 / fluent-api #224).
   * Worker orchestration lives in #100 (`recordingSync.ts`).
   */
  uploadVerseAudio: (
    params: UploadVerseAudioParams,
  ): Promise<VerseAudioResponse> => uploadVerseAudioRequest(params),

  /**
   * Aquifer-backed Translation Notes for one verse (fluent-api #274).
   * Empty Aquifer hits return `{ items: [] }`; upstream failure is `502`.
   */
  getTranslationNotes: (
    projectId: number,
    bookCode: string,
    chapter: number,
    verse: number,
    languageCode: string,
  ): Promise<ApiTranslationNotesResponse> =>
    authedRequest<ApiTranslationNotesResponse>(
      translationResourcesVersePath(
        projectId,
        'notes',
        bookCode,
        chapter,
        verse,
        languageCode,
      ),
    ),

  /**
   * Aquifer-backed Translation Questions for one verse (fluent-api #274).
   */
  getTranslationQuestions: (
    projectId: number,
    bookCode: string,
    chapter: number,
    verse: number,
    languageCode: string,
  ): Promise<ApiTranslationQuestionsResponse> =>
    authedRequest<ApiTranslationQuestionsResponse>(
      translationResourcesVersePath(
        projectId,
        'questions',
        bookCode,
        chapter,
        verse,
        languageCode,
      ),
    ),

  /**
   * Aquifer-backed Images & Maps for one verse (fluent-api #274).
   */
  getTranslationImages: (
    projectId: number,
    bookCode: string,
    chapter: number,
    verse: number,
    languageCode: string,
  ): Promise<ApiTranslationImagesResponse> =>
    authedRequest<ApiTranslationImagesResponse>(
      translationResourcesVersePath(
        projectId,
        'images',
        bookCode,
        chapter,
        verse,
        languageCode,
      ),
    ),
};

export { buildHeaders, buildMultipartAuthHeaders } from './httpClient';
