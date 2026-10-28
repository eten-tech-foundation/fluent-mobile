import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BookCover } from '../../../../components/ui/BookCover';
import type { HomeBookSummary } from '../../../../types/db/types';
import { useThemedStyles } from '../../../../theme/useTheme';

const PRESSED_OPACITY = 0.7;

function peerChecked(book: HomeBookSummary): boolean {
  return book.totalChapters > 0 && book.checkedChapters === book.totalChapters;
}

/** Spoken after the meta, since the cover's badge is hidden from TalkBack. */
export function bookStatus(book: HomeBookSummary): string {
  if (peerChecked(book)) return 'Peer checked';
  if (book.recordedChapters === 0) return 'Not recorded yet';
  if (book.recordedChapters === book.totalChapters) return 'Recorded';
  return `${book.recordedChapters} of ${book.totalChapters} chapters recorded`;
}

/** e.g. "1 yours · 2 with others · 47 open"; zero counts drop out. */
export function bookCounts(book: HomeBookSummary): string {
  const counts: [number, string][] = [
    [book.mine, 'yours'],
    [book.withOthers, 'with others'],
    [book.open, 'open'],
    [book.complete, 'complete'],
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
    name: { ...t.type.label, color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  if (books.length === 0) return null;

  return (
    <View testID="home-books">
      <Text style={styles.title} accessibilityRole="header">
        Books
      </Text>
      <View style={styles.grid}>
        {books.map(book => {
          const counts = bookCounts(book);
          return (
            <Pressable
              key={book.key}
              onPress={() => onOpen(book)}
              android_disableSound
              accessibilityRole="button"
              accessibilityLabel={`${book.bookName}, ${bookMeta(
                book,
              )}, ${bookStatus(book)}. Open book page.`}
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
              <Text style={styles.name} numberOfLines={1}>
                {book.bookName}
              </Text>
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
