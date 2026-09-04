/**
 * Chapter-level source audio with verse markers.
 * Used for dev preview mode testing.
 */
export type ChapterSourceAudio = {
  uri: string;
  verseMarkers: Array<{ verseNumber: number; startMs: number }>;
};

/** Public sample MP3 for dev preview only — not project source audio. */
export const DEV_PREVIEW_SOURCE_AUDIO_URI =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

const DEFAULT_VERSE_COUNT = 24;
const MS_PER_VERSE = 5000;

export type ResolveMockChapterSourceAudioParams = {
  verseCount?: number;
};

/**
 * Dev preview mode: simulates chapter-level source audio for testing without API.
 * Generates automatic verse markers spaced 5 seconds apart.
 */
export function resolveMockChapterSourceAudio(
  params: ResolveMockChapterSourceAudioParams = {},
): ChapterSourceAudio {
  const verseCount = Math.max(1, params.verseCount ?? DEFAULT_VERSE_COUNT);
  const verseMarkers = Array.from({ length: verseCount }, (_, index) => ({
    verseNumber: index + 1,
    startMs: index * MS_PER_VERSE,
  }));

  return {
    uri: DEV_PREVIEW_SOURCE_AUDIO_URI,
    verseMarkers,
  };
}
