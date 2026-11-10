import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  RECORD_AUDIO_CONFLICT_WARNING,
  RECORD_NO_PERICOPE,
  RECORD_TAKEN_CHAPTER_WARNING,
} from '../../../constants/messages';
import { useThemedStyles } from '../../../theme/useTheme';
import { PassageNotices } from '../../v2/screens/passage/PassageNotices';
import type { RecordNotice } from '../../v2/screens/passage/useRecorder';

/** The recorder's notices, with the ids it gives them. */
const SITUATIONS: { label: string; notice: RecordNotice }[] = [
  {
    label: 'Take conflict',
    notice: { id: 'conflict', message: RECORD_AUDIO_CONFLICT_WARNING },
  },
  {
    label: 'Assigned to someone else',
    notice: { id: 'taken', message: RECORD_TAKEN_CHAPTER_WARNING },
  },
  {
    label: 'No passage breaks',
    notice: { id: 'classic', message: RECORD_NO_PERICOPE, classic: true },
  },
];

/**
 * Above the player's waveform: what's wrong with this chapter, announced as
 * it appears. One that only classic drafting can fix adds the way there.
 * Turn each situation on to see them stack.
 */
export function PassageNoticesEntry() {
  const [on, setOn] = useState<string[]>(['conflict']);
  const [opened, setOpened] = useState(false);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    footer: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
      padding: t.spacing.lg,
      minHeight: t.spacing.xxl * 2,
      justifyContent: 'center',
    },
    empty: { ...t.type.meta, color: t.roles.fgSecondary, textAlign: 'center' },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg },
    link: { ...t.type.label, color: t.roles.accentPrimary },
    off: { color: t.roles.fgSecondary },
  }));
  const notices = SITUATIONS.filter(s => on.includes(s.notice.id)).map(
    s => s.notice,
  );
  const toggle = (id: string) => {
    setOpened(false);
    setOn(ids => (ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]));
  };

  return (
    <View style={styles.demo}>
      <View style={styles.footer}>
        {notices.length > 0 ? (
          <PassageNotices
            notices={notices}
            onOpenClassic={() => setOpened(true)}
            testID="gallery-notices"
          />
        ) : (
          <Text style={styles.empty}>Nothing to say about this chapter</Text>
        )}
      </View>
      {opened ? (
        <Text style={styles.empty}>Opens the chapter in classic drafting</Text>
      ) : null}
      <View style={styles.links}>
        {SITUATIONS.map(({ label, notice }) => (
          <Pressable
            key={notice.id}
            accessibilityRole="switch"
            accessibilityState={{ checked: on.includes(notice.id) }}
            onPress={() => toggle(notice.id)}
          >
            <Text style={[styles.link, !on.includes(notice.id) && styles.off]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
