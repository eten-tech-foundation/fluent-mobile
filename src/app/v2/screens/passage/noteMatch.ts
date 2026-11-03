import type { TranslationNoteItem } from '../../../../types/resources/translationNotes';
import type { PassageVerse } from '../../../../hooks/usePassage';

/** A note, placed in the passage when its phrase was found. */
export interface PassageNote {
  id: string;
  /** The phrase, as the note quotes it; shown as the note screen's title. */
  quote: string;
  body: string;
  /** Where its chip sits: a verse key and the word range, end exclusive. */
  span: { verse: string; start: number; end: number } | null;
}

/** A verse's chips: each word range and the note it opens. */
export type NoteChips = Map<
  string,
  { start: number; end: number; note: number }[]
>;

export function verseKey(chapterNumber: number, verseNumber: number) {
  return `${chapterNumber}:${verseNumber}`;
}

/** A verse's words, as the script lays them out. */
export function verseWords(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

/** Aquifer headings often wrap the phrase in its own quote marks. */
function unquote(text: string) {
  return text
    .trim()
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .trim();
}

/** Compare words without case, punctuation or quote marks. */
function bare(word: string) {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Finds each note's phrase in its verse and orders the notes as the script
 * reads: placed ones by verse and word, then the ones whose phrase isn't in
 * this text (a note can quote another translation) in the order they came.
 * A discontinuous quote ("This … covenant") places on its first part; a
 * phrase overlapping an earlier chip stays unplaced.
 */
export function matchNotes(
  verses: PassageVerse[],
  notes: TranslationNoteItem[],
): { notes: PassageNote[]; chips: NoteChips } {
  const order = new Map<string, number>();
  const words = new Map<string, string[]>();
  verses.forEach((v, i) => {
    const key = verseKey(v.chapterNumber, v.verseNumber);
    order.set(key, i);
    words.set(key, verseWords(v.text).map(bare));
  });
  const taken = new Map<string, boolean[]>();

  const placed: (PassageNote & { at: number })[] = [];
  const unplaced: PassageNote[] = [];
  for (const note of notes) {
    const quote = unquote(note.quote ?? note.title);
    // A one-block note keeps its heading in the body; the title shows it.
    const [first, ...rest] = note.body.split('\n');
    const body =
      rest.length > 0 && unquote(first ?? '') === quote
        ? rest.join('\n').trim()
        : note.body;
    const entry = { id: note.id, quote, body };
    const key = note.verse
      ? verseKey(note.verse.chapterNumber, note.verse.verseNumber)
      : null;
    const span = key ? find(words.get(key), quote, taken.get(key)) : null;
    if (key === null || span === null) {
      unplaced.push({ ...entry, span: null });
      continue;
    }
    const used = taken.get(key) ?? [];
    for (let i = span.start; i < span.end; i += 1) used[i] = true;
    taken.set(key, used);
    placed.push({
      ...entry,
      span: { verse: key, ...span },
      at: (order.get(key) ?? 0) * 10000 + span.start,
    });
  }
  placed.sort((a, b) => a.at - b.at);

  const ordered: PassageNote[] = [
    ...placed.map(({ at: _at, ...rest }) => rest),
    ...unplaced,
  ];
  const chips: NoteChips = new Map();
  ordered.forEach((n, index) => {
    if (!n.span) return;
    const list = chips.get(n.span.verse) ?? [];
    list.push({ start: n.span.start, end: n.span.end, note: index });
    chips.set(n.span.verse, list);
  });
  return { notes: ordered, chips };
}

/** A partial match needs this many words and this share of the quote. */
const MIN_RUN = 3;
const MIN_SHARE = 0.6;

function find(
  words: string[] | undefined,
  quote: string,
  taken: boolean[] | undefined,
): { start: number; end: number } | null {
  if (!words) return null;
  // Parts of a discontinuous quote are split by …, & or " - " (uW's
  // separate places in the verse); place on the first.
  const first = quote.split(/…|\.\.\.|&|"\s+-\s+"|\s+-\s+/)[0] ?? '';
  // Braces mark words the ULT supplied, which the source text may or may
  // not have: try the quote with them, then without.
  const targets = [
    first.replace(/[{}]/g, ''),
    first.replace(/\{[^}]*\}/g, ''),
  ].map(text => verseWords(text).map(bare).filter(Boolean));
  for (const target of targets) {
    const span = exact(words, target, taken);
    if (span) return span;
  }
  for (const target of targets) {
    const span = partial(words, target, taken);
    if (span) return span;
  }
  return null;
}

function exact(
  words: string[],
  target: string[],
  taken: boolean[] | undefined,
): { start: number; end: number } | null {
  if (target.length === 0) return null;
  for (let start = 0; start + target.length <= words.length; start += 1) {
    let hit = true;
    for (let j = 0; j < target.length; j += 1) {
      if (words[start + j] !== target[j] || taken?.[start + j]) {
        hit = false;
        break;
      }
    }
    if (hit) return { start, end: start + target.length };
  }
  return null;
}

/**
 * A note can quote another translation: take the longest run of its words
 * the verse shares, if it's most of the quote.
 */
function partial(
  words: string[],
  target: string[],
  taken: boolean[] | undefined,
): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  for (let a = 0; a < words.length; a += 1) {
    for (let b = 0; b < target.length; b += 1) {
      let n = 0;
      while (
        a + n < words.length &&
        b + n < target.length &&
        words[a + n] === target[b + n] &&
        !taken?.[a + n]
      ) {
        n += 1;
      }
      if (n > (best ? best.end - best.start : 0)) {
        best = { start: a, end: a + n };
      }
    }
  }
  const run = best ? best.end - best.start : 0;
  return run >= MIN_RUN && run >= target.length * MIN_SHARE ? best : null;
}
