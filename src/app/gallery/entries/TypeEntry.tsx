import React from 'react';
import { Text, View } from 'react-native';
import type { TypeStyleName } from '../../../theme/typeStyles';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';

const SAMPLES: { name: TypeStyleName; text: string }[] = [
  { name: 'heading', text: 'Chapter 14' },
  { name: 'reading', text: 'In the beginning' },
  { name: 'readingStrong', text: 'was the Word' },
  { name: 'lead', text: 'and the Word was with God.' },
  { name: 'title', text: 'John 1:1-5' },
  { name: 'body', text: 'Record each verse, then send it to Peer Check.' },
  { name: 'label', text: 'Verse 3' },
  { name: 'overline', text: 'Passage 2' },
  { name: 'meta', text: '7 chapters · offline' },
];

/** Every named type style in its Next family, with the spec under each sample. */
export function TypeEntry() {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.lg },
    sample: { gap: t.spacing.xs },
    spec: { ...t.type.label, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.demo}>
      {SAMPLES.map(({ name, text }) => {
        const style = theme.type[name];
        return (
          <View key={name} style={styles.sample}>
            <Text
              style={[style, { color: theme.roles.fgPrimary }]}
              maxFontSizeMultiplier={theme.fontScale.readingMax}
            >
              {text}
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
