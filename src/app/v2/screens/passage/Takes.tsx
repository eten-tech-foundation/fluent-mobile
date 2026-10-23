import React from 'react';
import { Pressable, Text } from 'react-native';
import { VerseChip } from '../../../../components/ui/VerseChip';
import type { PassageTake } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { formatLastActivity } from '../../../../utils/formatLastActivity';
import type { Ready } from './steps';

/** Like a music app's "Updated 3d ago": how many takes, and when. */
export function takesLine(
  passage: Ready,
  takes: PassageTake[] = passage.takes,
) {
  const { recordedStatus } = passage;
  if (takes.length === 0) {
    if (recordedStatus === 'recorded') return 'Recorded verse by verse';
    if (recordedStatus === 'partial') return 'Partly recorded';
    return 'Not recorded yet';
  }
  const latest = takes.reduce((a, b) => (b.recordedAt > a.recordedAt ? b : a));
  const when = formatLastActivity(latest.recordedAt);
  const count = `${takes.length} ${takes.length === 1 ? 'take' : 'takes'}`;
  return when ? `${count} · ${when}` : count;
}

/** Takes of the whole passage as numbered chips, like Figma's Recorder. */
export function Takes({
  takes,
  onPress,
}: {
  takes: PassageTake[];
  onPress: () => void;
}) {
  const styles = useThemedStyles(t => ({
    row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    label: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  if (takes.length === 0) return null;
  const selected = takes.find(take => take.selected);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${takes.length} ${
        takes.length === 1 ? 'take' : 'takes'
      }${selected ? `, take ${selected.takeNumber} selected` : ''}`}
      style={styles.row}
      testID="passage-takes"
    >
      <Text style={styles.label}>Takes</Text>
      {takes.map(take => (
        <VerseChip
          key={take.id}
          verse={take.takeNumber}
          current={take.selected}
        />
      ))}
    </Pressable>
  );
}
