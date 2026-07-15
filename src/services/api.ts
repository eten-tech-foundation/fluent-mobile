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
import { checkServerReachable } from './connectivity';
import {
  authedRequest,
  publicRequest,
  publicRequestWithResponse,
} from './httpClient';
import { resolveSessionToken } from './sessionToken';
import { createApiError } from './apiError';

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
};

export { buildHeaders } from './httpClient';
