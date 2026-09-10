import {
  pickSourceAudioItem,
  resolveSourceAudioUri,
  sourceAudioItemDurationMs,
  verseAtPositionMs,
  verseStartMs,
  chapterSourceAudioCacheKey,
  isSourceAudioItemExpired,
  isCachedSourceAudioResponseValid,
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

  it('maps catalog duration seconds to ms', () => {
    expect(sourceAudioItemDurationMs(undefined)).toBe(0);
    expect(
      sourceAudioItemDurationMs({
        format: 'mp3',
        url: 'https://cdn.example/ch.mp3',
        scope: 'chapter',
        durationSeconds: 631.4,
      }),
    ).toBe(631_400);
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

  it('resolves the active verse at a playback position', () => {
    const timestamps = [
      { verse: 1, startSeconds: 0 },
      { verse: 2, startSeconds: 4 },
      { verse: 3, startSeconds: 9 },
    ];
    expect(verseAtPositionMs(0, timestamps)).toBe(1);
    expect(verseAtPositionMs(3999, timestamps)).toBe(1);
    expect(verseAtPositionMs(4000, timestamps)).toBe(2);
    expect(verseAtPositionMs(9000, timestamps)).toBe(3);
    expect(verseAtPositionMs(500, undefined)).toBe(1);
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

  it('treats missing expiresAt as not expired', () => {
    expect(
      isSourceAudioItemExpired({
        format: 'mp3',
        url: 'https://cdn.example/ch.mp3',
        scope: 'chapter',
      }),
    ).toBe(false);
  });

  it('detects expired signed URLs in seconds or ms', () => {
    const nowMs = 1_700_000_000_000;
    expect(
      isSourceAudioItemExpired(
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
          expiresAt: Math.floor(nowMs / 1000) - 10,
        },
        nowMs,
      ),
    ).toBe(true);
    expect(
      isSourceAudioItemExpired(
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
          expiresAt: nowMs - 1,
        },
        nowMs,
      ),
    ).toBe(true);
    expect(
      isSourceAudioItemExpired(
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
          expiresAt: Math.floor(nowMs / 1000) + 60,
        },
        nowMs,
      ),
    ).toBe(false);
  });

  it('invalidates cached responses when the selected item expired', () => {
    const nowMs = 1_700_000_000_000;
    expect(
      isCachedSourceAudioResponseValid(
        {
          provider: 'aquifer',
          bible: { name: 'BSB', abbreviation: 'BSB' },
          bookCode: 'MRK',
          chapter: 1,
          items: [
            {
              format: 'mp3',
              url: 'https://cdn.example/ch.mp3',
              scope: 'chapter',
              expiresAt: Math.floor(nowMs / 1000) - 1,
            },
          ],
        },
        nowMs,
      ),
    ).toBe(false);
    expect(
      isCachedSourceAudioResponseValid(
        {
          provider: 'aquifer',
          bible: { name: 'BSB', abbreviation: 'BSB' },
          bookCode: 'MRK',
          chapter: 1,
          items: [],
        },
        nowMs,
      ),
    ).toBe(true);
  });
});
