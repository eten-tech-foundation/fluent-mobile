import { API_BASE_URL } from '@env';

async function request(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API failed: ${res.status}`);
  }

  return res.json();
}

function getHeaders(email?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (email) {
    headers['x-user-email'] = email;
  }
  return headers;
}

export const FluentAPI = {
  getLanguages: () => request('/languages'),
  getBooks: () => request('/books'),
  getBibles: () => request('/bibles'),

  getUserByEmail: (email: string) =>
    request(`/users/email/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: getHeaders(email),
    }),

  getUserProjects: (userId: number, email: string) =>
    request(`/users/${userId}/projects`, {
      method: 'GET',
      headers: getHeaders(email),
    }),

  getChapterAssignments: (userId: number, email: string) =>
    request(`/users/${userId}/chapter-assignments`, {
      method: 'GET',
      headers: getHeaders(email),
    }),

  getBibleTexts: (
    bibleId: number,
    chapters: Array<{ bookId: number; chapterNumber: number }>,
    email: string,
  ) =>
    request(`/bibles/${bibleId}/bulk-texts`, {
      method: 'POST',
      headers: getHeaders(email),
      body: JSON.stringify({ chapters }),
    }),
};
