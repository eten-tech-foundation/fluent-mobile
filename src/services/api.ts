import { checkServerReachable } from './connectivity';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

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
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Origin: API_BASE_URL,
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
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const errorBody = await res.text();
    console.error('API error:', res.status, errorBody);
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
