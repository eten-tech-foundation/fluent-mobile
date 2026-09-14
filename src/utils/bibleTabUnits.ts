import type { DraftingUnit } from '../services/draftingUnitPreference';
import type { VerseData } from '../types/db/types';
import type { ApiSourceAudioVerseTimestamp } from '../types/api/sourceAudio';
import { rangeCoversVerse, type RecordingVerseRange } from './recordingRange';

export type BibleUnitVerse = {
  chapterNumber: number;
  verseNumber: number;
};

export type BiblePericopeGroup = {
  pericopeNumber: string;
  pericopeTitle: string | null;
  section: number | null;
  verses: BibleUnitVerse[];
};

export type BibleUnit = {
  key: string;
  draftingUnit: DraftingUnit;
  verses: BibleUnitVerse[];
  /** Verse number label, or pericope range — never "Pericope N". */
  title: string;
  /** Verse in the current chapter used for selection. */
  anchorVerse: number;
  previewText: string;
  bodyVerses: { verseNumber: number; text: string }[];
};

export type BibleUnitRecordedStatus = 'none' | 'partial' | 'recorded';

export function unitContainsVerse(
  unit: { verses: BibleUnitVerse[] },
  chapterNumber: number,
  verseNumber: number,
): boolean {
  return unit.verses.some(
    verse =>
      verse.chapterNumber === chapterNumber &&
      verse.verseNumber === verseNumber,
  );
}

export type SubdivisionTickMark = {
  verse: number;
  ratio: number;
};

export function formatSourceAudioUnitCaption(args: {
  draftingUnit: DraftingUnit;
  index: number;
  total: number;
}): string {
  const label = args.draftingUnit === 'pericope' ? 'Pericope' : 'Verse';
  if (args.total <= 0) {
    return `${label} ${args.index}`;
  }
  return `${label} ${args.index} / ${args.total}`;
}

function verseTextMap(verses: VerseData[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const verse of verses) {
    map.set(verse.verseNumber, verse.text);
  }
  return map;
}

function pericopeTitle(args: {
  verses: BibleUnitVerse[];
  chapterName: string;
  bookName: string;
}): string {
  const first = args.verses[0];
  const last = args.verses[args.verses.length - 1];
  if (!first || !last) return args.chapterName;
  const spansChapters = first.chapterNumber !== last.chapterNumber;
  if (spansChapters) {
    return `${args.bookName} ${first.chapterNumber}:${first.verseNumber}–${last.chapterNumber}:${last.verseNumber}`;
  }
  if (first.verseNumber === last.verseNumber) {
    return `${args.chapterName}:${first.verseNumber}`;
  }
  return `${args.chapterName}:${first.verseNumber}–${last.verseNumber}`;
}

function anchorInChapter(
  unitVerses: BibleUnitVerse[],
  chapterNumber: number,
): number {
  const inChapter = unitVerses.find(v => v.chapterNumber === chapterNumber);
  return inChapter?.verseNumber ?? unitVerses[0]?.verseNumber ?? 1;
}

export function buildBibleUnits(args: {
  draftingUnit: DraftingUnit;
  verses: VerseData[];
  pericopes: BiblePericopeGroup[];
  chapterNumber: number;
  chapterName: string;
  bookName: string;
}): BibleUnit[] {
  const texts = verseTextMap(args.verses);
  if (args.draftingUnit === 'verse') {
    return args.verses.map(verse => ({
      key: `verse:${verse.verseNumber}`,
      draftingUnit: 'verse',
      verses: [
        {
          chapterNumber: verse.chapterNumber,
          verseNumber: verse.verseNumber,
        },
      ],
      title: String(verse.verseNumber),
      anchorVerse: verse.verseNumber,
      previewText: verse.text,
      bodyVerses: [{ verseNumber: verse.verseNumber, text: verse.text }],
    }));
  }

  return args.pericopes.map(pericope => {
    const bodyVerses = pericope.verses
      .filter(v => v.chapterNumber === args.chapterNumber)
      .map(v => ({
        verseNumber: v.verseNumber,
        text: texts.get(v.verseNumber) ?? '',
      }));
    return {
      key: `pericope:${pericope.section ?? ''}:${pericope.pericopeNumber}`,
      draftingUnit: 'pericope',
      verses: pericope.verses,
      title: pericopeTitle({
        verses: pericope.verses,
        chapterName: args.chapterName,
        bookName: args.bookName,
      }),
      anchorVerse: anchorInChapter(pericope.verses, args.chapterNumber),
      previewText: bodyVerses.map(v => v.text).join(' '),
      bodyVerses,
    };
  });
}

export function unitRecordedStatus(
  unitVerses: BibleUnitVerse[],
  coverages: RecordingVerseRange[],
): BibleUnitRecordedStatus {
  if (unitVerses.length === 0) return 'none';
  const coveredCount = unitVerses.filter(verse =>
    coverages.some(range =>
      rangeCoversVerse(range, verse.chapterNumber, verse.verseNumber),
    ),
  ).length;
  if (coveredCount === 0) return 'none';
  if (coveredCount === unitVerses.length) return 'recorded';
  return 'partial';
}

export function lastUnrecordedAnchorVerse(
  units: BibleUnit[],
  coverages: RecordingVerseRange[],
): number | null {
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (!unit) continue;
    if (unitRecordedStatus(unit.verses, coverages) !== 'recorded') {
      return unit.anchorVerse;
    }
  }
  return null;
}

export function subdivisionTickMarks(args: {
  timestamps: ApiSourceAudioVerseTimestamp[] | undefined;
  durationMs: number;
  boundaryVerses: number[];
}): SubdivisionTickMark[] {
  if (!args.timestamps?.length || args.durationMs <= 0) {
    return [];
  }
  const marks: SubdivisionTickMark[] = [];
  for (const verse of args.boundaryVerses) {
    const match = args.timestamps.find(t => t.verse === verse);
    const startSeconds = match?.startSeconds;
    if (startSeconds === undefined || !Number.isFinite(startSeconds)) {
      continue;
    }
    const startMs = Math.max(0, Math.round(startSeconds * 1000));
    const ratio = startMs / args.durationMs;
    if (ratio <= 0 || ratio >= 1) {
      continue;
    }
    marks.push({ verse, ratio });
  }
  return marks;
}
