/**
 * Verse the Next recorder keys a new passage take on: the first verse of the
 * passage that falls in this chapter. A recovered take keeps the verse it
 * was saved under instead.
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
