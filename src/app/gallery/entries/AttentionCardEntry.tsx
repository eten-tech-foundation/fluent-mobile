import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AttentionCard } from '../../v2/screens/home/AttentionCard';
import { useThemedStyles } from '../../../theme/useTheme';

/**
 * Home's attention card for a chapter sent back to me with changes to make.
 * Fixtures only until review results sync to the phone.
 */
const FIXTURES = [
  {
    id: 'changes-requested',
    label: 'Changes requested',
    eyebrow: 'Changes requested',
    title: 'Ravi left 3 notes on your Matthew 2',
    actionLabel: 'Make changes',
    faces: ['RK'],
  },
  {
    id: 'community',
    label: 'Community notes',
    eyebrow: 'Community notes',
    title: '6 notes from 3 reviewers on your Mark 14',
    actionLabel: 'Open review',
    faces: ['RK', 'AM', 'JS'],
  },
  {
    id: 'telugu',
    label: 'Telugu',
    eyebrow: 'కమ్యూనిటీ గమనికలు',
    title: 'మీ మార్కు 14 పై 3 మంది సమీక్షకుల నుండి 6 గమనికలు',
    actionLabel: 'సమీక్షను తెరవండి',
    faces: ['RK', 'AM'],
  },
] as const;

export function AttentionCardEntry() {
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    row: { flexDirection: 'row', gap: t.spacing.lg },
    link: { ...t.type.label, color: t.roles.accentPrimary },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  const fixture = FIXTURES[index];

  return (
    <View style={styles.demo}>
      <AttentionCard
        eyebrow={fixture.eyebrow}
        title={fixture.title}
        actionLabel={fixture.actionLabel}
        faces={[...fixture.faces]}
        onPress={() => setOpened(fixture.actionLabel)}
      />
      <Text style={styles.status}>
        {opened ? `Tapped: ${opened}` : 'Tap the card'}
      </Text>
      <View style={styles.row}>
        {FIXTURES.map((f, i) => (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            onPress={() => {
              setIndex(i);
              setOpened(null);
            }}
          >
            <Text style={styles.link}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
