import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  PassageCover,
  type PassageRecordedStatus,
} from '../../../components/ui/PassageCover';
import { useThemedStyles } from '../../../theme/useTheme';

const PASSAGES: {
  verses: string;
  title: string;
  reference: string;
  status: PassageRecordedStatus;
}[] = [
  {
    verses: '1–2',
    title: 'The Plot to Kill Jesus',
    reference: 'Mark 14:1–2',
    status: 'recorded',
  },
  {
    verses: '22–25',
    title: 'The Last Supper',
    reference: 'Mark 14:22–25',
    status: 'partial',
  },
  {
    verses: '26–31',
    title: 'Mark 14:26–31',
    reference: 'Mark 14:26–31',
    status: 'none',
  },
  {
    verses: '14:72–15:5',
    title: 'Jesus Before Pilate',
    reference: 'Mark 14:72–15:5',
    status: 'none',
  },
];

/**
 * A chapter of the book page: tap a cover to open it. Covers show the
 * verse range, a title (or the reference when there isn't one) and status.
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
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.demo}>
      <View style={styles.grid}>
        {PASSAGES.map(p => (
          <PassageCover
            key={p.reference}
            eyebrow="Mark 14"
            verses={p.verses}
            title={p.title}
            reference={p.reference}
            status={p.status}
            onPress={() => setOpened(p.reference)}
            style={styles.cover}
          />
        ))}
      </View>
      <Text style={styles.status}>
        {opened ? `Opened ${opened}` : 'Tap a passage'}
      </Text>
    </View>
  );
}
