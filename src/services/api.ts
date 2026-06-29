import { getApiBaseUrl } from '../config/apiBaseUrl';
import { logger } from '../utils/logger';
import { checkServerReachable } from './connectivity';

const log = logger.create('API');

const API_ERROR_BODY_LOG_LIMIT = 200;

function summarizeApiErrorResponse(
  status: number,
  body: string,
): Record<string, number | string> {
  const metadata: Record<string, number | string> = {
    status,
    contentLength: body.length,
  };

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.message === 'string') {
      metadata.message = parsed.message.slice(0, API_ERROR_BODY_LOG_LIMIT);
    }
    const errorCode = parsed.code ?? parsed.errorCode;
    if (typeof errorCode === 'string') {
      metadata.errorCode = errorCode;
    }
  } catch {
    // Non-JSON bodies are omitted from logs to avoid leaking response content.
  }

  return metadata;
}

let _activeToken: string | null = null;

export function setActiveToken(token: string | null): void {
  _activeToken = token;
}

const MOBILE_HEADERS = {
  'x-client-type': 'mobile',
  'User-Agent': 'fluent-mobile',
};

async function getHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    ...(_activeToken && { Authorization: `Bearer ${_activeToken}` }),
  };
}

async function publicRequest(endpoint: string, options?: RequestInit) {
  const apiBaseUrl = getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Origin: apiBaseUrl,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    try {
      const errorBody = await res.json();
      throw new Error(errorBody?.message ?? `API failed: ${res.status}`);
    } catch (e) {
      if (e instanceof Error && e.message !== `API failed: ${res.status}`)
        throw e;
      throw new Error(`API failed: ${res.status}`);
    }
  }
  return res.json();
}

async function request(endpoint: string, options?: RequestInit) {
  const headers = await getHeaders();
  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const errorBody = await res.text();
    log.error('API error', summarizeApiErrorResponse(res.status, errorBody));
    throw new Error(`API failed: ${res.status}`);
  }
  return res.json();
}

export const FluentAPI = {
  checkServerReachable,

  signIn: (email: string, password: string) =>
    publicRequest('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: MOBILE_HEADERS,
    }),
  forgotPassword: (email: string) =>
    publicRequest('/api/auth/forget-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: MOBILE_HEADERS,
    }),

  signOut: () =>
    request('/api/auth/sign-out', {
      method: 'POST',
      headers: MOBILE_HEADERS,
    }),

  getLanguages: () => publicRequest('/languages'),
  getBooks: () => publicRequest('/books'),
  getBibles: () => publicRequest('/bibles'),
  getUserByEmail: (email: string) =>
    request(`/users/email/${encodeURIComponent(email)}`),
  getUserProjects: (userId: number) => request(`/users/${userId}/projects`),
  getChapterAssignments: (
    userId: number,
    updatedAfter?: string,
    excludeProjectIds?: number[],
  ) => {
    const params = new URLSearchParams();
    if (updatedAfter) params.append('updatedAfter', updatedAfter);
    if (excludeProjectIds?.length) {
      params.append('excludeProjectIds', excludeProjectIds.join(','));
    }
    const query = params.toString();
    return request(
      `/users/${userId}/chapter-assignments/all${query ? `?${query}` : ''}`,
    );
  },

  getBibleTexts: (
    bibleId: number,
    chapters: Array<{ bookId: number; chapterNumber: number }>,
    updatedAfter?: string,
  ) =>
    publicRequest(`/bibles/${bibleId}/bulk-texts`, {
      method: 'POST',
      body: JSON.stringify({ chapters, ...(updatedAfter && { updatedAfter }) }),
    }),
};
