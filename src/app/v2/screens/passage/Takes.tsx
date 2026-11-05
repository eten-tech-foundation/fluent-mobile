import React from 'react';
import { Pressable, Text } from 'react-native';
import { VerseChip } from '../../../../components/ui/VerseChip';
import type { PassageTake } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { formatLastActivity } from '../../../../utils/formatLastActivity';
import {
  getWorkflowStage,
  isPastDraft,
  isPastPeerCheck,
} from '../../../../utils/workflowStage';
import type { Ready } from './ready';

/**
 * Like a music app's "Updated 3d ago": how many takes, and when, then
 * whether the chapter's send is waiting to go up.
 */
export function takesLine(
  passage: Ready,
  takes: PassageTake[] = passage.takes,
  countVerses = false,
) {
  const line = countVerses
    ? versesSummary(passage) ?? takesSummary(passage, [])
    : takesSummary(passage, takes);
  return passage.waitingToSend ? `${line} · Waiting to send` : line;
}

/** Counts the passage's verses recorded; null until one is. */
function versesSummary({ verses }: Ready) {
  const done = verses.filter(v => v.recorded !== null).length;
  return done === 0 ? null : `${done} of ${verses.length} verses recorded`;
}

function takesSummary(passage: Ready, takes: PassageTake[]) {
  const { recordedStatus, assignment } = passage;
  if (takes.length === 0) {
    // Like the book's cover: a sent chapter was recorded, maybe on another
    // phone or by another translator, so its takes needn't be here.
    const stage = getWorkflowStage(assignment.status);
    if (isPastDraft(stage)) {
      const label = isPastPeerCheck(stage) ? 'Peer checked' : 'In peer check';
      return `${label} · Takes aren't on this phone`;
    }
    if (recordedStatus === 'recorded') return 'Recorded verse by verse';
    if (recordedStatus === 'partial') {
      return versesSummary(passage) ?? 'Partly recorded';
    }
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
