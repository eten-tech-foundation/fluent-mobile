import React from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Avatar } from '../../../../components/ui/Avatar';
import { ArrowRight } from '../../../../components/ui/icons';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

const DOT = 8;
const FACE = 36;
const FACE_OVERLAP = 10;
const FACE_RING = 2;
const PRESSED_OPACITY = 0.7;

/**
 * Something that needs me, told as a sentence: who or what, then what to do
 * about it. Modeled on desktop's Community notes card. The whole card is one
 * button.
 */
export function AttentionCard({
  eyebrow,
  title,
  actionLabel,
  faces = [],
  onPress,
  style,
  testID,
}: {
  /** e.g. "Changes requested", set small and uppercase. */
  eyebrow: string;
  /** e.g. "Ravi left 3 notes on your Matthew 2". */
  title: string;
  /** e.g. "Make changes". */
  actionLabel: string;
  /** Initials of the people involved, first few overlapped. */
  faces?: string[];
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    card: {
      padding: t.spacing.lg,
      borderRadius: t.radius.md,
      backgroundColor: t.roles.surfaceDefault,
      gap: t.spacing.sm,
    },
    pressed: { opacity: PRESSED_OPACITY },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.accentPrimary,
    },
    eyebrow: {
      ...t.type.meta,
      color: t.roles.fgSecondary,
      textTransform: 'uppercase',
    },
    body: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
    title: { ...t.type.body, color: t.roles.fgPrimary, flex: 1 },
    faces: { flexDirection: 'row' },
    face: {
      width: FACE,
      height: FACE,
      borderWidth: FACE_RING,
      borderColor: t.roles.surfaceDefault,
    },
    overlap: { marginLeft: -FACE_OVERLAP },
    action: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
    actionLabel: { ...t.type.label, color: t.roles.accentPrimary },
  }));

  return (
    <Pressable
      onPress={onPress}
      android_disableSound
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}. ${title}. ${actionLabel}.`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      testID={testID}
    >
      <View style={styles.eyebrowRow}>
        <View style={styles.dot} />
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={3}>
          {title}
        </Text>
        {faces.length > 0 ? (
          <View
            style={styles.faces}
            testID={testID ? `${testID}-faces` : undefined}
          >
            {faces.map((initials, i) => (
              <Avatar
                key={`${initials}-${i}`}
                initials={initials}
                style={[styles.face, i > 0 && styles.overlap]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.action}>
        <Text style={styles.actionLabel}>{actionLabel}</Text>
        <ArrowRight
          color={theme.roles.accentPrimary}
          size={theme.controlSizes.icon20}
        />
      </View>
    </Pressable>
  );
}
