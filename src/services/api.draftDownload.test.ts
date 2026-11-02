jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';

function jsonResponse(body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => text,
    json: async () => body,
  } as Response;
}

describe('FluentAPI draft download reads (#508 / #704)', () => {
  beforeEach(() => {
    authToken.set('tok');
    jest.restoreAllMocks();
  });

  afterEach(() => {
    authToken.set(null);
  });

  it('GETs /verse-audio with chapter query params', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 9,
            projectUnitId: 12,
            bibleTextId: 3401,
            uploadedBy: 3,
            contentType: 'audio/mp4',
            sizeBytes: 4096,
            durationSeconds: 12.5,
            versionToken: 2,
            conflictStatus: 'clean',
            activeTakeId: 10,
            takes: [
              {
                id: 10,
                uploadedBy: 3,
                contentType: 'audio/mp4',
                sizeBytes: 2048,
                durationSeconds: 12.5,
                contentHash: 'abc',
                downloadUrl: 'https://example.test/take',
                createdAt: '2026-07-15T00:00:00.000Z',
                updatedAt: '2026-07-15T00:00:00.000Z',
              },
            ],
            verseNumber: 1,
            downloadUrl: 'https://example.test/sas',
            createdAt: '2026-07-15T00:00:00.000Z',
            updatedAt: '2026-07-15T00:00:00.000Z',
          },
        ],
        hasConflict: false,
      }),
    );

    const result = await FluentAPI.getChapterVerseAudio({
      projectUnitId: 12,
      bibleId: 1,
      bookId: 41,
      chapterNumber: 1,
    });

    expect(fetchSpy).toHaveBeenCalled();
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('/verse-audio?');
    expect(url).toContain('projectUnitId=12');
    expect(url).toContain('bibleId=1');
    expect(url).toContain('bookId=41');
    expect(url).toContain('chapterNumber=1');
    expect(result.items).toHaveLength(1);
    expect(result.hasConflict).toBe(false);
  });

  it('GETs /translated-verses with projectUnitId, bookId, chapterNumber', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          projectUnitId: 12,
          bibleTextId: 3401,
          assignedUserId: null,
          content: 'Draft text',
          markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
          verseNumber: 1,
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
      ]),
    );

    const result = await FluentAPI.getTranslatedVerses({
      projectUnitId: 12,
      bookId: 41,
      chapterNumber: 1,
    });

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('/translated-verses?');
    expect(url).toContain('projectUnitId=12');
    expect(url).toContain('bookId=41');
    expect(url).toContain('chapterNumber=1');
    expect(result[0]?.content).toBe('Draft text');
    expect(result[0]?.markers).toEqual({
      paragraphs: [{ marker: 'p', offset: 0 }],
    });
  });
});
