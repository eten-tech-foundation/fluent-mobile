import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Word } from '../../../components/ui/Word';
import { ColorModeScope, useThemedStyles } from '../../../theme/useTheme';

/** Mark 14:24 with its notes' phrases, from the Listen player (Figma 2440:30858). */
const PHRASES = [
  {
    words: ['“This', 'is'],
    note: 'Here, the pronoun This refers to the wine in the cup.',
  },
  {
    words: ['My', 'blood', 'of', 'the', 'covenant,'],
    note: 'Here, Jesus is using the possessive form to describe how his blood initiates the covenant.',
  },
];

/**
 * The script in the player: Phrase chips sit inline in the reading text and
 * wrap between words. Tapping one shows its note, as the player opens it.
 */
export function WordEntry() {
  return (
    <ColorModeScope value="canvas">
      <Script />
    </ColorModeScope>
  );
}

function Script() {
  const [open, setOpen] = useState<number | null>(null);
  const styles = useThemedStyles(t => ({
    stage: {
      backgroundColor: t.roles.bgDefault,
      padding: t.spacing.xl,
      gap: t.spacing.lg,
    },
    reading: { ...t.type.reading, color: t.roles.fgPrimary },
    chip: {
      fontSize: t.type.reading.fontSize,
      lineHeight: t.type.reading.lineHeight - t.spacing.xs,
    },
    note: { ...t.type.body, color: t.roles.fgSecondary },
  }));
  return (
    <View style={styles.stage}>
      <Text style={styles.reading}>
        He said to them,{' '}
        {PHRASES.map((p, i) => (
          <React.Fragment key={i}>
            {p.words.map((w, j) => (
              <Word
                key={j}
                word={w}
                variant="phrase"
                textStyle={styles.chip}
                onPress={() => setOpen(i)}
                accessibilityLabel={`Translation note: ${p.words.join(' ')}`}
                hiddenFromAccessibility={j > 0}
              />
            ))}{' '}
          </React.Fragment>
        ))}
        which is poured out for many.
      </Text>
      <Text style={styles.note}>
        {open === null ? 'Tap a phrase to read its note.' : PHRASES[open].note}
      </Text>
    </View>
  );
}
