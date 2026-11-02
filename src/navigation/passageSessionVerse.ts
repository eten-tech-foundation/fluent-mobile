/**
 * Verse the Next recorder keys a passage take on: the first verse of the
 * passage that falls in this chapter. The paused-take session key is that
 * verse, so recovery can reopen the passage only when it matches.
 */
export function passageSessionVerse(
  verses: ReadonlyArray<{ chapterNumber: number; verseNumber: number }>,
  chapterNumber: number,
): number | null {
  return (
    verses.find(verse => verse.chapterNumber === chapterNumber)?.verseNumber ??
    verses[0]?.verseNumber ??
    null
  );
}
