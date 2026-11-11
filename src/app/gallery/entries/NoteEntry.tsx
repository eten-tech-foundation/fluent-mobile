import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  PlayFill,
  SkipBackFill,
  SkipForwardFill,
  X,
} from '../../../components/ui/icons';
import { Key } from '../../../components/ui/Key';
import { KeyDeck } from '../../../components/ui/KeyDeck';
import { PageDots } from '../../../components/ui/PageDots';
import { RoundButton } from '../../../components/ui/RoundButton';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { ColorModeScope, useThemedStyles } from '../../../theme/useTheme';

/** Mark 14:22–24's notes, in the order the script shows them. */
const NOTES = [
  {
    quote: 'This is',
    body: 'Here, the pronoun This refers to the wine in the cup.',
  },
  {
    quote: 'My blood of the covenant,',
    body: 'Here, Jesus is using the possessive form to describe how his blood initiates the covenant.',
  },
  {
    quote: 'poured out for many',
    body: 'Jesus is speaking of his death. Poured out is how blood leaves a body, and many means many people.',
  },
];

/**
 * A translation note over the player (Accent): Close is a Flat Round button
 * on blue, the dots under it count the passage's notes, and the player's
 * Previous and Next step through them. Play stays off, since notes have no
 * audio yet. Closed, the real keys go back to stepping verses; here they
 * just turn off.
 */
export function NoteEntry() {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const note = NOTES[index];
  const previous = NOTES[index - 1];
  const next = NOTES[index + 1];
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.lg },
    note: { backgroundColor: t.roles.bgDefault, borderRadius: t.radius.sm },
    title: { ...t.type.overline, color: t.roles.fgPrimary, flex: 1 },
    body: {
      ...t.type.lead,
      color: t.roles.fgPrimary,
      paddingHorizontal: t.spacing.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.lg + t.spacing.xl,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.xxl + t.spacing.lg,
    },
    quote: { ...t.type.title, color: t.roles.fgPrimary, flex: 1 },
    link: {
      ...t.type.label,
      color: t.roles.fgPrimary,
      padding: t.spacing.xl,
    },
    key: { flex: 1 },
  }));

  return (
    <View style={styles.demo}>
      <ColorModeScope value="accent">
        <View style={styles.note}>
          {open ? (
            <>
              <ScreenHeader scrolled={false}>
                <Text
                  style={styles.title}
                  numberOfLines={1}
                  accessibilityRole="header"
                >
                  {note.quote}
                </Text>
                <RoundButton
                  variant="flat"
                  icon={X}
                  accessibilityLabel="Close the note"
                  onPress={() => setOpen(false)}
                  testID="gallery-note-close"
                />
              </ScreenHeader>
              <Text style={styles.body}>{note.body}</Text>
              <View style={styles.row}>
                <Text style={styles.quote} numberOfLines={1}>
                  “{note.quote}”
                </Text>
                <PageDots
                  count={NOTES.length}
                  index={index}
                  accessibilityLabel={`Note ${index + 1} of ${NOTES.length}`}
                  testID="gallery-note-dots"
                />
              </View>
            </>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
              <Text style={styles.link}>Open the note again</Text>
            </Pressable>
          )}
        </View>
      </ColorModeScope>
      <ColorModeScope value="hardware">
        <KeyDeck>
          <Key
            icon={PlayFill}
            accessibilityLabel="This note's audio isn't available yet"
            disabled
            style={styles.key}
            testID="gallery-note-play"
          />
          <Key
            icon={SkipBackFill}
            accessibilityLabel={
              previous ? `Previous note: ${previous.quote}` : 'Previous'
            }
            disabled={!open || !previous}
            onPress={() => setIndex(i => i - 1)}
            style={styles.key}
            testID="gallery-note-previous"
          />
          <Key
            icon={SkipForwardFill}
            accessibilityLabel={next ? `Next note: ${next.quote}` : 'Next'}
            disabled={!open || !next}
            onPress={() => setIndex(i => i + 1)}
            style={styles.key}
            testID="gallery-note-next"
          />
        </KeyDeck>
      </ColorModeScope>
    </View>
  );
}
