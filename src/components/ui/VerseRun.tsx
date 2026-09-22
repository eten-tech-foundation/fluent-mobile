import React from 'react';
import { theme } from '../../theme';
import { StyleSheet, Text, View } from 'react-native';

export type VerseRunItem = {
  chapterNumber: number;
  verseNumber: number;
  text: string;
};

export function VerseRun({ verses }: { verses: VerseRunItem[] }) {
  return (
    <View style={styles.verseRun}>
      {verses.map((verse, index) => (
        <React.Fragment key={`${verse.chapterNumber}:${verse.verseNumber}`}>
          {index > 0 ? (
            <View style={styles.verseWord}>
              <Text style={styles.verseBody}> </Text>
            </View>
          ) : null}
          <View style={styles.verseSuperAlign}>
            <View
              style={styles.verseSuperSlot}
              testID={`bible-pericope-verse-${verse.chapterNumber}-${verse.verseNumber}`}
            >
              <Text style={styles.verseSuper}>{verse.verseNumber}</Text>
            </View>
          </View>
          {verse.text.split(' ').map((word, wordIndex, words) => (
            <View
              key={`${verse.chapterNumber}-${verse.verseNumber}-${wordIndex}`}
              style={styles.verseWord}
            >
              <Text style={styles.verseBody}>
                {wordIndex < words.length - 1 ? `${word} ` : word}
              </Text>
            </View>
          ))}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  verseRun: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  verseWord: {
    alignSelf: 'flex-start',
  },
  verseBody: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
    includeFontPadding: false,
  },
  verseSuperAlign: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    height: theme.typography.lineHeights.normal,
  },
  verseSuperSlot: {
    marginRight: 2,
    transform: [{ translateY: 3 }],
  },
  verseSuper: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
    includeFontPadding: false,
  },
});
