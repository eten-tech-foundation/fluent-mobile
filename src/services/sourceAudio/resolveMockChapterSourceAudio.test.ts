import {
  DEV_PREVIEW_SOURCE_AUDIO_URI,
  resolveMockChapterSourceAudio,
} from './resolveMockChapterSourceAudio';

describe('resolveMockChapterSourceAudio', () => {
  it('returns a playable uri and evenly spaced verse markers', () => {
    const result = resolveMockChapterSourceAudio({ verseCount: 3 });

    expect(result.uri).toBe(DEV_PREVIEW_SOURCE_AUDIO_URI);
    expect(result.verseMarkers).toEqual([
      { verseNumber: 1, startMs: 0 },
      { verseNumber: 2, startMs: 5000 },
      { verseNumber: 3, startMs: 10000 },
    ]);
  });

  it('defaults to 24 verses when verse count is omitted', () => {
    const result = resolveMockChapterSourceAudio();

    expect(result.verseMarkers).toHaveLength(24);
    expect(result.verseMarkers[23]).toEqual({
      verseNumber: 24,
      startMs: 23 * 5000,
    });
  });
});
