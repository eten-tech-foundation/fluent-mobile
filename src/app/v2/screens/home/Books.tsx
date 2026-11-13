import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BookCover } from '../../../../components/ui/BookCover';
import type { HomeBookSummary } from '../../../../types/db/types';
import { useThemedStyles } from '../../../../theme/useTheme';

const PRESSED_OPACITY = 0.7;
/**
 * Books in Home's first frame: three rows, which fill a phone screen. Each
 * cover is an SVG of a dozen gradient shapes, so a long list (140 books is
 * 5,000 native views) is drawn after that frame is on screen (#972).
 */
export const FIRST_FRAME_BOOKS = 6;

function peerChecked(book: HomeBookSummary): boolean {
  return book.totalChapters > 0 && book.checkedChapters === book.totalChapters;
}

/** Spoken after the meta, since the cover's badge is hidden from TalkBack. */
export function bookStatus(book: HomeBookSummary): string {
  if (book.totalChapters === 0) return 'No chapters yet';
  if (peerChecked(book)) return 'Peer checked';
  if (book.recordedChapters === 0) return 'Not recorded yet';
  if (book.recordedChapters === book.totalChapters) return 'Recorded';
  return `${book.recordedChapters} of ${book.totalChapters} chapters recorded`;
}

/**
 * e.g. "1 yours · 2 with others · 47 open · 3 to upload"; zero counts drop
 * out.
 */
export function bookCounts(book: HomeBookSummary): string {
  if (book.totalChapters === 0) return 'No chapters yet';
  const counts: [number, string][] = [
    [book.mine, 'yours'],
    [book.withOthers, 'with others'],
    [book.open, 'open'],
    [book.complete, 'complete'],
    [book.pendingUploads, 'to upload'],
  ];
  return counts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(' · ');
}

/** e.g. "Design team 1st · 1 yours · 2 with others · 47 open". */
export function bookMeta(book: HomeBookSummary): string {
  return [book.milestoneName, bookCounts(book)].filter(Boolean).join(' · ');
}

function bookLabel(book: HomeBookSummary): string {
  if (book.totalChapters === 0) {
    return `${book.milestoneName}, No chapters yet. Open book page.`;
  }
  return `${book.bookName}, ${bookMeta(book)}, ${bookStatus(
    book,
  )}. Open book page.`;
}

/**
 * Home's last section: a grid of the books in the milestones I belong to,
 * summarizing everyone's chapters. A book opens the milestone's book page at
 * its first chapter.
 */
export function Books({
  books,
  onOpen,
}: {
  books: HomeBookSummary[];
  onOpen: (book: HomeBookSummary) => void;
}) {
  const styles = useThemedStyles(t => ({
    title: {
      ...t.type.title,
      color: t.roles.fgPrimary,
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.xxl,
      paddingBottom: t.spacing.md,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.xl,
      rowGap: t.spacing.xl,
    },
    book: { width: '47%', gap: t.spacing.xs },
    pressed: { opacity: PRESSED_OPACITY },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  // Seeded false so a list that arrives long after an empty first render
  // is deferred too, not only one that mounts long.
  const [showAll, setShowAll] = useState(false);
  const deferRest = books.length > FIRST_FRAME_BOOKS && !showAll;
  useEffect(() => {
    if (!deferRest) return;
    // Next frame: the first rows are committed, and drawing them on the UI
    // thread overlaps with building the rest here.
    const frame = requestAnimationFrame(() => setShowAll(true));
    return () => cancelAnimationFrame(frame);
  }, [deferRest]);

  if (books.length === 0) return null;
  const shown = deferRest ? books.slice(0, FIRST_FRAME_BOOKS) : books;

  return (
    <View testID="home-books">
      <Text style={styles.title} accessibilityRole="header">
        Books
      </Text>
      <View style={styles.grid}>
        {shown.map(book => {
          const counts = bookCounts(book);
          return (
            <Pressable
              key={book.key}
              onPress={() => onOpen(book)}
              android_disableSound
              accessibilityRole="button"
              accessibilityLabel={bookLabel(book)}
              style={({ pressed }) => [styles.book, pressed && styles.pressed]}
              testID={`home-book-${book.key}`}
            >
              <BookCover
                bookName={book.bookName}
                recorded={
                  book.totalChapters > 0
                    ? book.recordedChapters / book.totalChapters
                    : 0
                }
                peerChecked={peerChecked(book)}
                testID={`home-book-${book.key}-cover`}
              />
              <Text style={styles.meta} numberOfLines={1}>
                {book.milestoneName}
              </Text>
              {counts ? <Text style={styles.meta}>{counts}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
