export type LabelScope = {
  startChapter: number | null;
  endChapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
};

const NONE: LabelScope = {
  startChapter: null,
  endChapter: null,
  verseStart: null,
  verseEnd: null,
};

export function parseLabelScope(label: string): LabelScope {
  // cross-chapter: "1:1-2.3" or "1:1–2:25" -> chapter range, no verse
  const cross = label.match(/(\d+):(\d+)\s*[-–]\s*(\d+)[:.](\d+)/);
  if (cross) {
    return {
      startChapter: Number(cross[1]),
      endChapter: Number(cross[3]),
      verseStart: null,
      verseEnd: null,
    };
  }
  // single verse or range inside one chapter: "1:1", "1:14-31"
  const m = label.match(/(\d+):(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!m) return NONE;
  const chapter = Number(m[1]);
  const start = Number(m[2]);
  return {
    startChapter: chapter,
    endChapter: chapter,
    verseStart: start,
    verseEnd: m[3] ? Number(m[3]) : start,
  };
}

export function rowCoversVerse(
  row: { verseStart?: number; verseEnd?: number },
  verse: number,
): boolean {
  if (row.verseStart == null || row.verseEnd == null) return true;
  return row.verseStart <= verse && verse <= row.verseEnd;
}
