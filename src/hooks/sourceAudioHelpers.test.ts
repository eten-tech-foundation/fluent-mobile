import {
  pickSourceAudioItem,
  resolveSourceAudioUri,
  verseStartMs,
  chapterSourceAudioCacheKey,
} from './sourceAudioHelpers';
import type { ApiSourceAudioResponse } from '../types/api/sourceAudio';

describe('sourceAudioHelpers', () => {
  it('prefers mp3 over webm', () => {
    const item = pickSourceAudioItem([
      {
        format: 'webm',
        url: 'https://cdn.example/a.webm',
        scope: 'chapter',
      },
      {
        format: 'mp3',
        url: 'https://cdn.example/a.mp3',
        scope: 'chapter',
      },
    ]);
    expect(item?.format).toBe('mp3');
    expect(item?.url).toBe('https://cdn.example/a.mp3');
  });

  it('returns null for empty items', () => {
    expect(pickSourceAudioItem([])).toBeNull();
    expect(
      resolveSourceAudioUri({
        provider: 'aquifer',
        bible: { name: 'BSB', abbreviation: 'BSB' },
        bookCode: 'MRK',
        chapter: 1,
        items: [],
      }),
    ).toBeNull();
  });

  it('maps verse timestamps to ms and prefers matching dbl id', () => {
    expect(verseStartMs(2, undefined)).toBe(0);
    expect(
      verseStartMs(2, [
        { verse: 1, startSeconds: 0 },
        { verse: 2, startSeconds: 12.5 },
      ]),
    ).toBe(12500);
    expect(
      verseStartMs(
        2,
        [
          { verse: 2, startSeconds: 1, dblAudioBibleId: 'a' },
          { verse: 2, startSeconds: 9, dblAudioBibleId: 'b' },
        ],
        'b',
      ),
    ).toBe(9000);
  });

  it('builds a stable chapter cache key', () => {
    expect(
      chapterSourceAudioCacheKey({
        projectId: 1,
        bookCode: 'MRK',
        chapter: 14,
        bibleId: 7,
        languageCode: 'eng',
      }),
    ).toBe('1|MRK|14|7|eng');
  });

  it('resolves uri from response items', () => {
    const response: ApiSourceAudioResponse = {
      provider: 'dbl',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
          dblAudioBibleId: 'dbl-1',
        },
      ],
    };
    expect(resolveSourceAudioUri(response)).toEqual({
      uri: 'https://cdn.example/ch.mp3',
      item: response.items[0],
    });
  });
});
