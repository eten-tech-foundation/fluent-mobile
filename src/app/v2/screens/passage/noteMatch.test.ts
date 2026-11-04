import { matchNotes, verseKey } from './noteMatch';

const verse = (verseNumber: number, text: string) => ({
  chapterNumber: 14,
  verseNumber,
  text,
});
const note = (id: string, quote: string, verseNumber?: number) => ({
  id,
  title: quote,
  body: `About ${quote}`,
  quote,
  ...(verseNumber ? { verse: { chapterNumber: 14, verseNumber } } : {}),
});

const VERSES = [
  verse(23, 'And He took the cup, gave thanks, and gave it to them.'),
  verse(
    24,
    'He said to them, “This is My blood of the covenant, which is poured out for many.',
  ),
];

describe('matchNotes', () => {
  it('places a phrase in its verse, ignoring case and punctuation', () => {
    const { notes, chips } = matchNotes(VERSES, [
      note('a', 'This is my blood of the covenant', 24),
    ]);

    expect(notes[0].span).toEqual({ verse: '14:24', start: 4, end: 11 });
    expect(chips.get(verseKey(14, 24))).toEqual([
      { start: 4, end: 11, note: 0 },
    ]);
  });

  it('orders placed notes as the script reads, then the unplaced ones', () => {
    const { notes } = matchNotes(VERSES, [
      note('later', 'poured out', 24),
      note('elsewhere', 'a phrase from another translation', 24),
      note('first', 'took the cup', 23),
      note('no-verse', 'This is'),
    ]);

    expect(notes.map(n => n.id)).toEqual([
      'first',
      'later',
      'elsewhere',
      'no-verse',
    ]);
    expect(notes[2].span).toBeNull();
  });

  it('places a discontinuous quote on its first part', () => {
    const { notes } = matchNotes(VERSES, [note('a', 'This is … covenant', 24)]);

    expect(notes[0].span).toEqual({ verse: '14:24', start: 4, end: 6 });
  });

  it('leaves a phrase that overlaps an earlier chip unplaced', () => {
    const { notes, chips } = matchNotes(VERSES, [
      note('whole', 'This is my blood', 24),
      note('part', 'my blood', 24),
    ]);

    expect(notes.map(n => n.id)).toEqual(['whole', 'part']);
    expect(notes[1].span).toBeNull();
    expect(chips.get('14:24')).toHaveLength(1);
  });

  it('drops quote marks and the heading a note repeats in its body', () => {
    const { notes } = matchNotes(VERSES, [
      {
        id: 'a',
        title: 'Mark 14:24',
        quote: '"This is"',
        body: '"This is"\nHere, the pronoun This refers to the wine.',
        verse: { chapterNumber: 14, verseNumber: 24 },
      },
    ]);

    expect(notes[0].quote).toBe('This is');
    expect(notes[0].body).toBe('Here, the pronoun This refers to the wine.');
    expect(notes[0].span).toEqual({ verse: '14:24', start: 4, end: 6 });
  });

  it('places a quote from another translation on the words it shares', () => {
    const { notes } = matchNotes(VERSES, [
      note('ult', 'This is my blood of the new covenant', 24),
      note('short', 'gave thanks to God', 23),
    ]);

    // Six of its eight words, in a row, are in the verse.
    expect(notes[0].span).toEqual({ verse: '14:24', start: 4, end: 10 });
    // Two shared words aren't enough to place it.
    expect(notes[1].span).toBeNull();
  });

  it('places a list of separate places on its first, ignoring supplied words', () => {
    const { notes } = matchNotes(VERSES, [
      note('names', '"blood" - "covenant"', 24),
      note('supplied', 'gave {it} thanks', 23),
    ]);

    expect(notes.find(n => n.id === 'names')?.span).toEqual({
      verse: '14:24',
      start: 7,
      end: 8,
    });
    expect(notes.find(n => n.id === 'supplied')?.span).toEqual({
      verse: '14:23',
      start: 5,
      end: 7,
    });
  });
});
