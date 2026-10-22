import React from 'react';
import { Text, View } from 'react-native';
import { PageDots } from '../../../../components/ui/PageDots';
import {
  Waveform,
  type WaveformVerse,
} from '../../../../components/ui/Waveform';
import type { PassageTake, PassageVerse } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { STEPS, type Ready } from './steps';
import { Takes } from './Takes';

/**
 * Under the script, as in the Figma Listen player: the waveform with its verse
 * chips, then the reference and which page of the script is showing. Record
 * mode adds the takes.
 */
export function Footer({
  passage,
  page,
  recordMode,
  takes,
  onOpenDrafting,
}: {
  passage: Ready;
  page: number;
  recordMode: boolean;
  takes: PassageTake[];
  onOpenDrafting: () => void;
}) {
  const styles = useThemedStyles(t => ({
    footer: {
      backgroundColor: t.roles.bgDefault,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
      gap: t.spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    reference: { ...t.type.label, color: t.roles.fgPrimary },
  }));
  const pages = 1 + STEPS.length;
  const name = page === 0 ? passage.reference : STEPS[page - 1];
  return (
    <View style={styles.footer}>
      {recordMode ? (
        <Takes takes={takes} onPress={onOpenDrafting} />
      ) : (
        // Materials have no audio yet, so their waveform stays empty.
        <Waveform
          verses={page === 0 ? scriptBars(passage.verses) : []}
          progress={0}
          accessibilityLabel={`${name} playback`}
          testID="passage-waveform"
        />
      )}
      <View style={styles.row}>
        <Text style={styles.reference} numberOfLines={1}>
          {name}
        </Text>
        <PageDots
          count={pages}
          index={page}
          accessibilityLabel={`${name}, ${page + 1} of ${pages}`}
          testID="passage-pages"
        />
      </View>
    </View>
  );
}

/** Waveform bar heights in pt (Waveform's row is 52). */
const BAR_MIN = 6;
const BAR_MAX = 52;

/**
 * Stand-in levels until playback is wired: a bar per word, taller for longer
 * words, so each verse's chip and segment follow its length.
 */
function scriptBars(verses: PassageVerse[]): WaveformVerse[] {
  return verses
    .filter(v => v.text)
    .map(v => ({
      verse: v.verseNumber,
      bars: v.text
        .split(/\s+/)
        .filter(Boolean)
        .map(word => Math.min(BAR_MAX, BAR_MIN + word.length * 5)),
    }));
}
