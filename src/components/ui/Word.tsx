import React from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { useThemedStyles } from '../../theme/useTheme';

export type WordStyle = 'plain' | 'note' | 'phrase';

export interface WordProps {
  word: string;
  /**
   * Plain: fg/secondary, no fill. Note: fg/primary in a stroke/2
   * accent/primary outline, a phrase with a translation note at rest (not in
   * Figma yet).
   * Phrase: accent/primary fill, fg/on-accent, the phrase in focus.
   */
  variant: WordStyle;
  /**
   * The reading size; the caller animates it as the script grows. Pass a
   * lineHeight a space/4 shorter than the line's, so wrapped chips keep a
   * space/4 gap (Figma: chip height = line height − space/4).
   */
  textStyle?: StyleProp<AnimatedStyle<StyleProp<TextStyle>>>;
  /** Positions the box, e.g. to drop an inline chip onto the text's line. */
  boxStyle?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  maxFontSizeMultiplier?: number;
  onPress?: (e: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  /** Later words of a phrase: TalkBack reads the phrase once, on its first. */
  hiddenFromAccessibility?: boolean;
  /** Square the side that touches the next word of a phrase on its line. */
  joinStart?: boolean;
  joinEnd?: boolean;
  testID?: string;
}

/**
 * Figma Word (2409:495): one reading token, laid inline in the script's
 * text. Phrase marks a phrase with a translation note and opens it.
 */
export function Word({
  word,
  variant,
  textStyle,
  boxStyle,
  maxFontSizeMultiplier,
  onPress,
  accessibilityLabel,
  hiddenFromAccessibility = false,
  joinStart = false,
  joinEnd = false,
  testID,
}: WordProps) {
  const styles = useThemedStyles(t => ({
    box: {
      borderRadius: t.radius.xs,
      paddingHorizontal: t.spacing.xs,
    },
    // Same border as Note, in the fill's color, so both are one size.
    phrase: {
      backgroundColor: t.roles.accentPrimary,
      borderWidth: t.stroke[2],
      borderColor: t.roles.accentPrimary,
    },
    note: {
      borderWidth: t.stroke[2],
      borderColor: t.roles.accentPrimary,
    },
    // Touching words of an outlined phrase drop the border between them,
    // padding its width back so the line doesn't re-wrap.
    noteJoinStart: {
      borderLeftWidth: 0,
      paddingLeft: t.spacing.xs + t.stroke[2],
    },
    noteJoinEnd: {
      borderRightWidth: 0,
      paddingRight: t.spacing.xs + t.stroke[2],
    },
    pressed: { opacity: t.opacity.disabled },
    joinStart: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
    joinEnd: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
    text: { ...t.type.reading, color: t.roles.fgSecondary },
    phraseText: { color: t.roles.fgOnAccent },
    noteText: { color: t.roles.fgPrimary },
  }));
  const box = [
    styles.box,
    variant === 'phrase' && styles.phrase,
    variant === 'note' && styles.note,
    joinStart && styles.joinStart,
    joinEnd && styles.joinEnd,
    variant === 'note' && joinStart && styles.noteJoinStart,
    variant === 'note' && joinEnd && styles.noteJoinEnd,
  ];
  const label = (
    <Animated.Text
      style={[
        styles.text,
        variant === 'phrase' && styles.phraseText,
        variant === 'note' && styles.noteText,
        textStyle,
      ]}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {word}
    </Animated.Text>
  );
  if (!onPress) {
    return (
      <Animated.View style={[box, boxStyle]} testID={testID}>
        {label}
      </Animated.View>
    );
  }
  return (
    <Animated.View style={boxStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? word}
        importantForAccessibility={
          hiddenFromAccessibility ? 'no-hide-descendants' : 'auto'
        }
        style={({ pressed }) => [box, pressed && styles.pressed]}
        testID={testID}
      >
        {label}
      </Pressable>
    </Animated.View>
  );
}
