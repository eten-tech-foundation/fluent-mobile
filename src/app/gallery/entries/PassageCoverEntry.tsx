import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { BookCover } from '../../../components/ui/BookCover';
import { PassageCover } from '../../../components/ui/PassageCover';
import type { CoverStyle } from '../../../components/ui/coverArt/generator';
import { useThemedStyles } from '../../../theme/useTheme';

const PASSAGES: {
  verses: string;
  title: string;
  reference: string;
  recordedVerses: number;
  totalVerses: number;
  submitted?: boolean;
  peerChecked?: boolean;
}[] = [
  {
    verses: '1–2',
    title: 'The Plot to Kill Jesus',
    reference: 'Mark 14:1–2',
    recordedVerses: 2,
    totalVerses: 2,
    submitted: true,
    peerChecked: true,
  },
  {
    verses: '22–25',
    title: 'The Last Supper',
    reference: 'Mark 14:22–25',
    recordedVerses: 2,
    totalVerses: 4,
  },
  {
    verses: '26–31',
    title: 'Mark 14:26–31',
    reference: 'Mark 14:26–31',
    recordedVerses: 6,
    totalVerses: 6,
    submitted: true,
  },
  {
    verses: '14:72–15:5',
    title: 'Jesus Before Pilate',
    reference: 'Mark 14:72–15:5',
    recordedVerses: 0,
    totalVerses: 6,
  },
];

const STYLES: CoverStyle[] = ['mist', 'current', 'dawn'];

/** One passage of 7 verses, from untouched to peer checked. */
const STATES: {
  label: string;
  recordedVerses: number;
  waitingToSend?: boolean;
  submitted?: boolean;
  peerChecked?: boolean;
}[] = [
  { label: 'None', recordedVerses: 0 },
  { label: '3 of 7', recordedVerses: 3 },
  { label: 'Recorded', recordedVerses: 7 },
  { label: 'Waiting to send', recordedVerses: 7, waitingToSend: true },
  { label: 'In peer check', recordedVerses: 7, submitted: true },
  {
    label: 'Peer checked',
    recordedVerses: 7,
    submitted: true,
    peerChecked: true,
  },
];

/** Books by how many of their chapters are recorded; long names shrink. */
const BOOKS: { bookName: string; recorded: number; peerChecked: boolean }[] = [
  { bookName: 'Deuteronomy', recorded: 0, peerChecked: false },
  { bookName: 'Mark', recorded: 0.4, peerChecked: false },
  { bookName: '1 Thessalonians', recorded: 1, peerChecked: false },
  { bookName: 'Titus', recorded: 1, peerChecked: true },
];

/**
 * A chapter of the book page: tap a cover to open it. Covers show art drawn
 * from the passage, its verse range, a title (or the reference when there
 * isn't one) and status. Below, each art style through recording, the send
 * waiting to go up, and peer check, then book covers.
 */
export function PassageCoverEntry() {
  const [opened, setOpened] = useState<string | null>(null);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: t.spacing.xl,
    },
    cover: { width: '47%' },
    states: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: t.spacing.md,
    },
    state: { width: '47%' },
    heading: {
      ...t.type.label,
      color: t.roles.fgPrimary,
      marginTop: t.spacing.lg,
    },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.demo}>
      <View style={styles.grid}>
        {PASSAGES.map((p, i) => (
          <PassageCover
            key={p.reference}
            eyebrow="Mark 14"
            verses={p.verses}
            title={p.title}
            reference={p.reference}
            seed={`Mark:${i}`}
            groupSeed="Mark:14"
            recordedVerses={p.recordedVerses}
            totalVerses={p.totalVerses}
            submitted={p.submitted}
            peerChecked={p.peerChecked}
            onPress={() => setOpened(p.reference)}
            style={styles.cover}
          />
        ))}
      </View>
      <Text style={styles.status}>
        {opened ? `Opened ${opened}` : 'Tap a passage'}
      </Text>
      {STYLES.map(coverStyle => (
        <View key={coverStyle} style={styles.demo}>
          <Text style={styles.heading}>{coverStyle}</Text>
          <View style={styles.states}>
            {STATES.map(s => (
              <PassageCover
                key={s.label}
                eyebrow="Mark 14"
                verses="22–28"
                title={s.label}
                reference={`Mark 14:22–28, ${s.label}`}
                seed={`Mark:${coverStyle}`}
                groupSeed="Mark:14"
                recordedVerses={s.recordedVerses}
                totalVerses={7}
                waitingToSend={s.waitingToSend}
                submitted={s.submitted}
                peerChecked={s.peerChecked}
                coverStyle={coverStyle}
                style={styles.state}
              />
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.heading}>Books</Text>
      <View style={styles.states}>
        {BOOKS.map(b => (
          <BookCover key={b.bookName} {...b} style={styles.state} />
        ))}
      </View>
    </View>
  );
}
