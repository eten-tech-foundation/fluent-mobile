import {
  ApiBook,
  ApiChapterAssignment,
  ApiUserChapterAssignmentsByUser,
} from './types';

export interface ApiUser {
  id: number;
  username?: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface ApiLanguage {
  id: number;
  langName: string;
  langNameLocalized?: string;
  langCode?: string;
  scriptDirection?: string;
}

export interface ApiBookMeta {
  id: number;
  code: string;
  eng_display_name: string;
}

export interface ApiBible {
  id: number;
  languageId: number;
  name: string;
  abbreviation: string;
}

export interface ApiProject {
  id: number;
  name: string;
  sourceLanguageId?: number;
  source_language_id?: number;
  source_language_name?: string;
  targetLanguageId?: number;
  target_language_id?: number;
  target_language_name?: string;
  isActive?: boolean;
  status?: string;
  updatedAt?: string;
}

export interface ApiDataResponse<T> {
  data: T;
}

export interface SignInResponse {
  token: string;
  user: Pick<ApiUser, 'email'>;
}

export interface ForgotPasswordResponse {
  message?: string;
}

export interface SignOutResponse {
  success?: boolean;
}

export type BibleTextsResponse = ApiDataResponse<ApiBook[]>;

export type ChapterAssignmentsResponse =
  | ApiDataResponse<ApiChapterAssignment[]>
  | ApiChapterAssignment[];

export type UserChapterAssignmentsResponse = ApiUserChapterAssignmentsByUser;

export type UserProjectsResponse = ApiDataResponse<ApiProject[]> | ApiProject[];

/** Normalizes list endpoints that return either `{ data: T }` or a bare array. */
export function unwrapApiListResponse<T>(response: ApiDataResponse<T> | T): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    !Array.isArray(response) &&
    'data' in response
  ) {
    return (response as ApiDataResponse<T>).data;
  }

  return response as T;
}
