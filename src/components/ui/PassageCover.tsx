import React from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useThemedStyles } from '../../theme/useTheme';

const PRESSED_OPACITY = 0.7;

export type PassageRecordedStatus = 'none' | 'partial' | 'recorded';

const STATUS_LABELS: Record<PassageRecordedStatus, string> = {
  none: 'Not recorded yet',
  partial: 'Partly recorded',
  recorded: 'Recorded',
};

export interface PassageCoverProps {
  /** Small line on the cover, e.g. "Mark 14". */
  eyebrow: string;
  /** Verse range set large on the cover, e.g. "22–25". */
  verses: string;
  /** Under the cover: the pericope title, or the reference without one. */
  title: string;
  status: PassageRecordedStatus;
  onPress?: () => void;
  /** Spoken reference, e.g. "Mark 14:22–25". */
  reference: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A passage in the book page's gallery: a typographic cover with the verse
 * range, then its title and how much is recorded. Flat, since tactile
 * controls stay in the player. A placeholder until the Claude Design covers.
 */
export function PassageCover({
  eyebrow,
  verses,
  title,
  status,
  onPress,
  reference,
  style,
  testID,
}: PassageCoverProps) {
  const styles = useThemedStyles(t => ({
    item: { gap: t.spacing.xs },
    pressed: { opacity: PRESSED_OPACITY },
    cover: {
      aspectRatio: 1,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.surfaceInverse,
      padding: t.spacing.md,
      justifyContent: 'space-between',
    },
    eyebrow: { ...t.type.meta, color: t.roles.fgOnInverse },
    verses: { ...t.type.heading, color: t.roles.fgOnInverse },
    title: { ...t.type.label, color: t.roles.fgPrimary },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  const statusLabel = STATUS_LABELS[status];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        title === reference
          ? `${reference}, ${statusLabel}`
          : `${title}, ${reference}, ${statusLabel}`
      }
      style={({ pressed }) => [styles.item, pressed && styles.pressed, style]}
      testID={testID}
    >
      <View style={styles.cover}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text style={styles.verses} numberOfLines={1} adjustsFontSizeToFit>
          {verses}
        </Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.status} testID={testID && `${testID}-status`}>
        {statusLabel}
      </Text>
    </Pressable>
  );
}
