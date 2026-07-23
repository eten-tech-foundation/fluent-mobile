jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { ApiError } from '../types/api/errors';
import { FluentAPI, buildMultipartAuthHeaders } from './api';
import { AuthError } from './authError';
import { authToken } from './authToken';
import { parseApiErrorBody } from './apiError';
import {
  buildVerseAudioFormData,
  verseAudioUploadPath,
} from './verseAudioFormData';

const successBody = {
  id: 9,
  projectUnitId: 12,
  bibleTextId: 3401,
  uploadedBy: 3,
  contentType: 'audio/mp4',
  sizeBytes: 4096,
  durationSeconds: 12.5,
  verseNumber: 1,
  downloadUrl: 'https://example.test/sas',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

describe('buildMultipartAuthHeaders', () => {
  beforeEach(() => {
    authToken.set(null);
  });

  it('omits Content-Type so FormData can set the boundary', () => {
    authToken.set('tok');
    expect(buildMultipartAuthHeaders()).toEqual({
      Authorization: 'Bearer tok',
    });
    expect(buildMultipartAuthHeaders()).not.toHaveProperty('Content-Type');
  });
});

describe('verseAudioFormData helpers', () => {
  type GlobalWithFormData = typeof globalThis & {
    FormData: new () => { append: jest.Mock };
  };

  it('builds the PUT path from path params only', () => {
    expect(verseAudioUploadPath(12, 3401)).toBe('/verse-audio/12/3401');
  });

  it('appends file and optional durationSeconds', () => {
    const append = jest.fn();
    const g = globalThis as GlobalWithFormData;
    const OriginalFormData = g.FormData;
    g.FormData = jest.fn(() => ({ append })) as unknown as typeof g.FormData;

    try {
      const blob = { __blob: true } as unknown as Blob;
      buildVerseAudioFormData({ file: blob, durationSeconds: 12.5 });
      expect(append).toHaveBeenCalledWith('file', blob);
      expect(append).toHaveBeenCalledWith('durationSeconds', '12.5');
    } finally {
      g.FormData = OriginalFormData;
    }
  });

  it('accepts React Native uri file parts and omits duration when unset', () => {
    const append = jest.fn();
    const g = globalThis as GlobalWithFormData;
    const OriginalFormData = g.FormData;
    g.FormData = jest.fn(() => ({ append })) as unknown as typeof g.FormData;

    try {
      const file = {
        uri: 'file:///data/recordings/a.m4a',
        name: 'a.m4a',
        type: 'audio/mp4',
      };
      buildVerseAudioFormData({ file });
      expect(append).toHaveBeenCalledWith('file', file);
      expect(append).not.toHaveBeenCalledWith(
        'durationSeconds',
        expect.anything(),
      );
    } finally {
      g.FormData = OriginalFormData;
    }
  });
});

describe('parseApiErrorBody (verse-audio 503 shape)', () => {
  it('joins error + details from storage-unavailable bodies', () => {
    expect(
      parseApiErrorBody(
        JSON.stringify({
          error: 'Verse audio is not available',
          details: 'Audio storage is not configured',
        }),
      ),
    ).toEqual({
      message: 'Verse audio is not available: Audio storage is not configured',
      code: undefined,
    });
  });
});

describe('FluentAPI.uploadVerseAudio', () => {
  const fetchMock = jest.fn();
  const sampleFile = {
    uri: 'file:///x.m4a',
    name: 'x.m4a',
    type: 'audio/mp4',
  };

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
    authToken.set('session-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    authToken.set(null);
  });

  it('PUTs multipart to /verse-audio/{projectUnitId}/{bibleTextId} with Bearer and no JSON Content-Type', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(successBody),
    });

    const response = await FluentAPI.uploadVerseAudio({
      projectUnitId: 12,
      bibleTextId: 3401,
      file: sampleFile,
      durationSeconds: 12.5,
    });

    expect(response.id).toBe(9);
    expect(response.downloadUrl).toBe('https://example.test/sas');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:9999/verse-audio/12/3401');
    expect(init.method).toBe('PUT');
    expect(init.body).toBeInstanceOf(FormData);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer session-token');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('throws when a 200 body is missing required fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 1 }),
    });

    await expect(
      FluentAPI.uploadVerseAudio({
        projectUnitId: 1,
        bibleTextId: 2,
        file: sampleFile,
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/Malformed verse audio response/),
    });
  });

  it('throws terminal ApiError on 400', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: 'Missing audio file' }),
    });

    await expect(
      FluentAPI.uploadVerseAudio({
        projectUnitId: 1,
        bibleTextId: 2,
        file: sampleFile,
      }),
    ).rejects.toMatchObject({
      status: 400,
      isTerminal: true,
      isRetryable: false,
    } as Partial<ApiError>);
  });

  it('throws terminal ApiError on 413 payload too large', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 413,
      text: async () =>
        JSON.stringify({ message: 'Audio file exceeds the 30 MB limit' }),
    });

    await expect(
      FluentAPI.uploadVerseAudio({
        projectUnitId: 1,
        bibleTextId: 2,
        file: sampleFile,
      }),
    ).rejects.toMatchObject({
      status: 413,
      isTerminal: true,
    } as Partial<ApiError>);
  });

  it('throws on 503 storage unavailable with error/details message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () =>
        JSON.stringify({
          error: 'Verse audio is not available',
          details: 'Audio storage is not configured',
        }),
    });

    await expect(
      FluentAPI.uploadVerseAudio({
        projectUnitId: 1,
        bibleTextId: 2,
        file: sampleFile,
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Verse audio is not available: Audio storage is not configured',
    });
  });

  it('throws retryable ApiError on 500', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ message: 'Internal server error' }),
    });

    await expect(
      FluentAPI.uploadVerseAudio({
        projectUnitId: 1,
        bibleTextId: 2,
        file: sampleFile,
      }),
    ).rejects.toMatchObject({
      status: 500,
      isRetryable: true,
    } as Partial<ApiError>);
  });

  it('throws AuthError on 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: 'Unauthorized' }),
    });

    await expect(
      FluentAPI.uploadVerseAudio({
        projectUnitId: 1,
        bibleTextId: 2,
        file: sampleFile,
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws network ApiError (status 0) when fetch fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      FluentAPI.uploadVerseAudio({
        projectUnitId: 1,
        bibleTextId: 2,
        file: sampleFile,
      }),
    ).rejects.toMatchObject({
      status: 0,
      isRetryable: true,
    } as Partial<ApiError>);
  });
});
