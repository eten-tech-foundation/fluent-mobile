import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TypeStyleName } from '../../../theme/typeStyles';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';

const SAMPLES: { name: TypeStyleName; text: string; telugu: string }[] = [
  { name: 'heading', text: 'Chapter 14', telugu: 'అధ్యాయం 14' },
  { name: 'reading', text: 'In the beginning', telugu: 'ఆదియందు' },
  { name: 'readingStrong', text: 'was the Word', telugu: 'వాక్యముండెను' },
  {
    name: 'lead',
    text: 'and the Word was with God.',
    telugu: 'ఆ వాక్యము దేవునియొద్ద ఉండెను.',
  },
  { name: 'title', text: 'John 1:1-5', telugu: 'యోహాను 1:1-5' },
  {
    name: 'body',
    text: 'Record each verse, then send it to Peer Check.',
    telugu: 'ప్రతి వచనాన్ని రికార్డ్ చేసి, పీర్ చెక్‌కు పంపండి.',
  },
  { name: 'label', text: 'Verse 3', telugu: 'వచనం 3' },
  { name: 'overline', text: 'Passage 2', telugu: 'భాగం 2' },
  {
    name: 'meta',
    text: '7 chapters · offline',
    telugu: '7 అధ్యాయాలు · ఆఫ్‌లైన్',
  },
];

/**
 * Every named type style in its Next family, with the spec under each
 * sample. Telugu swaps in the taller line heights that keep conjuncts whole.
 */
export function TypeEntry() {
  const theme = useTheme();
  const [inTelugu, setInTelugu] = useState(false);
  const telugu: Partial<Record<TypeStyleName, { lineHeight: number }>> =
    theme.typeTelugu;
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.lg },
    sample: { gap: t.spacing.xs },
    spec: { ...t.type.label, color: t.roles.fgSecondary },
    link: { ...t.type.label, color: t.roles.accentPrimary },
  }));

  return (
    <View style={styles.demo}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setInTelugu(v => !v)}
      >
        <Text style={styles.link}>{inTelugu ? 'English' : 'Telugu'}</Text>
      </Pressable>
      {SAMPLES.map(({ name, text, telugu: teluguText }) => {
        const style = {
          ...theme.type[name],
          ...(inTelugu ? telugu[name] : undefined),
        };
        return (
          <View key={name} style={styles.sample}>
            <Text
              style={[style, { color: theme.roles.fgPrimary }]}
              maxFontSizeMultiplier={theme.fontScale.readingMax}
            >
              {inTelugu ? teluguText : text}
            </Text>
            <Text style={styles.spec}>
              {`${name} · ${style.fontFamily ?? 'System'} ${
                style.fontWeight
              } · ${style.fontSize}/${style.lineHeight}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
