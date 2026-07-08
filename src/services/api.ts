import { getApiBaseUrl } from '../config/apiBaseUrl';
import { logger } from '../utils/logger';
import { authToken } from './authToken';
import { parseApiErrorMessage } from './apiError';
import { AuthError } from './authError';
import { NetworkError } from './networkError';
import { resolveSessionToken } from './sessionToken';
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

const MOBILE_HEADERS = {
  'x-client-type': 'mobile',
  'User-Agent': 'fluent-mobile',
};

/** Builds authenticated request headers; synchronous and testable. */
export function buildHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const token = authToken.get();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...extra,
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
    const errorBody = await res.text();
    log.error(
      'Public API error',
      summarizeApiErrorResponse(res.status, errorBody),
    );
    throw new Error(parseApiErrorMessage(res.status, errorBody));
  }
  return res.json();
}

async function request(endpoint: string, options?: RequestInit) {
  const headers = buildHeaders();
  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const errorBody = await res.text();
    log.error('API error', summarizeApiErrorResponse(res.status, errorBody));
    const message = parseApiErrorMessage(res.status, errorBody);
    if (res.status === 401) {
      throw new AuthError(message);
    }
    throw new Error(message);
  }
  return res.json();
}

async function signInRequest(email: string, password: string) {
  const apiBaseUrl = getApiBaseUrl();

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: apiBaseUrl,
        ...MOBILE_HEADERS,
      },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new NetworkError(undefined, err);
  }
  if (!res.ok) {
    let message = `Sign-in failed: ${res.status}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) {
        message = errorBody.message;
      }
    } catch {
      // Non-JSON body — keep stable status message.
    }
    throw new Error(message);
  }

  const data = await res.json();
  const token = resolveSessionToken(
    res.headers.get('set-auth-token'),
    data.token as string | undefined,
  );

  if (!token) {
    throw new Error('Sign-in succeeded but no session token was returned');
  }

  return { ...data, token };
}

export const FluentAPI = {
  checkServerReachable,

  signIn: (email: string, password: string) => signInRequest(email, password),
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
