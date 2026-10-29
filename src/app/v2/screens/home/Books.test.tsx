import React from 'react';
import { StyleSheet } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { bookCounts, bookMeta, Books, bookStatus } from './Books';
import { resolveTheme } from '../../../../theme';
import { UiVersionOverride } from '../../../../theme/useTheme';
import { measureFace, ringFill } from '../../../../test/coverBadge';
import type { HomeBookSummary } from '../../../../types/db/types';

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

const hidden = { includeHiddenElements: true };

function book(overrides: Partial<HomeBookSummary> = {}): HomeBookSummary {
  return {
    key: '1:41',
    bookId: 41,
    bookName: 'Mark',
    projectId: 3,
    projectUnitId: 1,
    projectName: 'Telugu NT',
    milestoneName: 'Design team 1st',
    targetLanguageName: 'Telugu',
    firstChapterId: 7,
    mine: 1,
    withOthers: 2,
    open: 47,
    complete: 0,
    totalChapters: 50,
    recordedChapters: 0,
    checkedChapters: 0,
    ...overrides,
  };
}

describe('bookCounts', () => {
  it('lists the counts that are not zero', () => {
    expect(bookCounts(book())).toBe('1 yours · 2 with others · 47 open');
    expect(
      bookCounts(book({ mine: 0, withOthers: 0, open: 0, complete: 0 })),
    ).toBe('');
  });
});

describe('bookMeta', () => {
  it('names the milestone, then the counts that are not zero', () => {
    expect(bookMeta(book())).toBe(
      'Design team 1st · 1 yours · 2 with others · 47 open',
    );
    expect(
      bookMeta(book({ mine: 0, withOthers: 0, open: 0, complete: 16 })),
    ).toBe('Design team 1st · 16 complete');
  });
});

describe('bookStatus', () => {
  it('counts recorded chapters until all pass peer check', () => {
    expect(bookStatus(book())).toBe('Not recorded yet');
    expect(bookStatus(book({ recordedChapters: 3 }))).toBe(
      '3 of 50 chapters recorded',
    );
    expect(
      bookStatus(book({ recordedChapters: 50, checkedChapters: 49 })),
    ).toBe('Recorded');
    expect(
      bookStatus(book({ recordedChapters: 50, checkedChapters: 50 })),
    ).toBe('Peer checked');
  });
});

describe('Books', () => {
  it('opens the book page from a card, in the order given', () => {
    const onOpen = jest.fn();
    const mark = book();
    const genesis = book({
      key: '2:1',
      bookId: 1,
      bookName: 'Genesis',
      mine: 0,
      withOthers: 0,
      open: 50,
    });
    render(<Books books={[mark, genesis]} onOpen={onOpen} />);

    expect(screen.getByText('Books')).toBeTruthy();
    const cards = screen.getAllByRole('button');
    expect(cards.map(c => c.props.accessibilityLabel)).toEqual([
      'Mark, Design team 1st · 1 yours · 2 with others · 47 open, Not recorded yet. Open book page.',
      'Genesis, Design team 1st · 50 open, Not recorded yet. Open book page.',
    ]);

    fireEvent.press(cards[1]);
    expect(onOpen).toHaveBeenCalledWith(genesis);
  });

  it("draws the book's meter on its cover, then a check", () => {
    const { rerender } = render(
      <Books books={[book({ recordedChapters: 10 })]} onOpen={jest.fn()} />,
    );
    measureFace('home-book-1:41-cover-face');
    expect(ringFill()).toBeCloseTo(0.2);

    rerender(
      <Books
        books={[book({ recordedChapters: 50, checkedChapters: 50 })]}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByTestId('cover-badge-check', hidden)).toBeTruthy();
  });

  it('draws every book on the darker night ground', () => {
    render(
      <UiVersionOverride value="next">
        <Books
          books={[book(), book({ key: '1:1', bookId: 1, bookName: 'Genesis' })]}
          onOpen={jest.fn()}
        />
      </UiVersionOverride>,
    );

    const { surfaceSunken } = resolveTheme('next', 'canvas').roles;
    for (const key of ['1:41', '1:1']) {
      const face = screen.getByTestId(`home-book-${key}-cover-face`);
      expect(StyleSheet.flatten(face.props.style).backgroundColor).toBe(
        surfaceSunken,
      );
    }
  });

  it("sets the book's name on its cover", () => {
    render(<Books books={[book()]} onOpen={jest.fn()} />);

    const cover = screen.getByTestId('home-book-1:41-cover');
    expect(within(cover).getByText('Book')).toBeTruthy();
    expect(within(cover).getByText('Mark')).toBeTruthy();
  });

  it('puts the milestone on its own line and the counts under it', () => {
    const { rerender } = render(<Books books={[book()]} onOpen={jest.fn()} />);
    expect(screen.getByText('Design team 1st')).toBeTruthy();
    expect(screen.getByText('1 yours · 2 with others · 47 open')).toBeTruthy();

    rerender(
      <Books
        books={[book({ mine: 0, withOthers: 0, open: 0 })]}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText('Design team 1st')).toBeTruthy();
    expect(screen.queryByText(/yours|open/)).toBeNull();
  });

  it('renders nothing without books', () => {
    render(<Books books={[]} onOpen={jest.fn()} />);

    expect(screen.queryByTestId('home-books')).toBeNull();
  });
});
