import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { CheckBold } from '../../../../components/ui/icons';
import { ProgressRing } from '../../../../components/ui/ProgressRing';
import type { PassageVerse } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

/** What each verse's row says about it. */
function verseStatus(recorded: PassageVerse['recorded']) {
  if (recorded === 'verse') return 'Recorded';
  if (recorded === 'passage') return 'Recorded in a passage take';
  return 'Not recorded yet';
}

/**
 * Verse mode's rows under the hero, where the passage's listening materials
 * go (Q11). Each ring fills once the verse is recorded; tapping a row opens
 * Listen on it.
 */
export function VerseList({
  verses,
  onOpen,
}: {
  verses: PassageVerse[];
  onOpen: (verseNumber: number) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    list: { flex: 1 },
    content: {
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.lg,
      gap: t.spacing.sm,
    },
    heading: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: t.spacing.xs,
    },
    title: { ...t.type.label, color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.xs,
    },
    text: { flex: 1, gap: t.spacing.xxs },
    name: { ...t.type.body, color: t.roles.fgPrimary },
    number: { ...t.type.label, color: t.roles.fgSecondary },
  }));
  const done = verses.filter(v => v.recorded !== null).length;
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      testID="passage-verse-list"
      data={verses}
      keyExtractor={v => String(v.verseNumber)}
      ListHeaderComponent={
        <View style={styles.heading}>
          <Text style={styles.title} accessibilityRole="header">
            Verses
          </Text>
          <Text style={styles.meta}>
            {`${done} of ${verses.length} recorded`}
          </Text>
        </View>
      }
      renderItem={({ item: v }) => {
        const status = verseStatus(v.recorded);
        return (
          <Pressable
            onPress={() => onOpen(v.verseNumber)}
            accessibilityRole="button"
            accessibilityLabel={`Verse ${v.verseNumber}, ${status}`}
            accessibilityHint="Opens this verse in Listen"
            style={styles.row}
            testID={`passage-verse-row-${v.verseNumber}`}
          >
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {`Verse ${v.verseNumber}`}
              </Text>
              {v.recorded === 'passage' ? (
                <Text style={styles.meta}>{status}</Text>
              ) : null}
            </View>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <ProgressRing
                value={v.recorded === null ? 0 : 1}
                accessibilityLabel={`Verse ${v.verseNumber} recorded`}
              >
                {v.recorded === null ? (
                  <Text style={styles.number}>{v.verseNumber}</Text>
                ) : (
                  <CheckBold
                    color={theme.roles.accentPrimary}
                    size={theme.controlSizes.icon24}
                  />
                )}
              </ProgressRing>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
