import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ArrowDown,
  ArrowRight,
  PlayFill,
  Waveform,
  X,
} from '../../../components/ui/icons';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { RoundButton } from '../../../components/ui/RoundButton';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { RECORD_OBSERVER } from '../../../constants/messages';
import { ColorModeScope, useThemedStyles } from '../../../theme/useTheme';
import { PassageNotices } from '../../v2/screens/passage/PassageNotices';
import { RecordAction } from '../../v2/screens/passage/RecordAction';

/**
 * Listening progress in whole steps, so a track lands exactly on complete.
 * 100ms matches the player's position updates (usePlaybackEngine).
 */
const STEPS = 50;
const STEP_MS = 100;
const REFERENCE = 'Mark 14:22–25';

/** The Last Supper's tracks, as on the Figma pericope screen. */
const TRACKS = [
  { id: 'source', title: 'Source Text', listened: STEPS },
  { id: 'hear', title: 'Hear & Heart', listened: STEPS },
  { id: 'stage', title: 'Setting the Stage', listened: STEPS / 2 },
  { id: 'scenes', title: 'Defining the Scenes', listened: 0 },
  { id: 'embody', title: 'Embodying the Text', listened: 0 },
];

/**
 * Passage rows: the ring shows how far through each track of the pericope
 * you've listened. Tap a row's button to play it (it advances while playing,
 * tap again to pause; starting another track pauses this one).
 */
function PassageRows() {
  const [listened, setListened] = useState<Record<string, number>>(() =>
    Object.fromEntries(TRACKS.map(t => [t.id, t.listened])),
  );
  const [playing, setPlaying] = useState<string | null>(null);
  const styles = useThemedStyles(t => ({
    rows: { gap: t.spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.xs,
    },
    text: { flex: 1, gap: t.spacing.xs },
    title: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.lg,
      includeFontPadding: false,
    },
    titlePlaying: { color: t.roles.fgPrimary },
    reference: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  const playingSteps = playing ? listened[playing] : 0;

  useEffect(() => {
    if (!playing) {
      return;
    }
    if (playingSteps >= STEPS) {
      setPlaying(null);
      return;
    }
    const timer = setTimeout(
      () => setListened(l => ({ ...l, [playing]: l[playing] + 1 })),
      STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, playingSteps]);

  const play = (id: string) => {
    if (playing === id) {
      setPlaying(null);
      return;
    }
    if (listened[id] >= STEPS) {
      setListened(l => ({ ...l, [id]: 0 }));
    }
    setPlaying(id);
  };

  return (
    <View style={styles.rows}>
      {TRACKS.map(track => {
        const isPlaying = playing === track.id;
        return (
          <View key={track.id} style={styles.row}>
            <View style={styles.text}>
              <Text style={[styles.title, isPlaying && styles.titlePlaying]}>
                {track.title}
              </Text>
              <Text style={styles.reference}>{REFERENCE}</Text>
            </View>
            <ProgressRing
              value={listened[track.id] / STEPS}
              accessibilityLabel={`${track.title} listened`}
            >
              <RoundButton
                icon={isPlaying ? Waveform : ArrowRight}
                accessibilityLabel={
                  isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
                }
                onPress={() => play(track.id)}
                testID={`gallery-passage-${track.id}`}
              />
            </ProgressRing>
          </View>
        );
      })}
    </View>
  );
}

/** Flat lives in the dark player header: the minimize arrow (Canvas). */
function PlayerHeader() {
  const [minimized, setMinimized] = useState(false);
  const styles = useThemedStyles(t => ({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      padding: t.spacing.lg,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.bgDefault,
    },
    text: { flex: 1, gap: t.spacing.xs },
    title: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.lg,
      includeFontPadding: false,
    },
    hint: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
  }));

  return (
    <View style={styles.header}>
      <RoundButton
        variant="flat"
        icon={ArrowDown}
        accessibilityLabel="Minimize player"
        onPress={() => setMinimized(m => !m)}
        testID="gallery-player-minimize"
      />
      <View style={styles.text}>
        <Text style={styles.title}>The Last Supper</Text>
        <Text style={styles.hint}>
          {minimized ? 'Minimized to the Now playing bar' : 'Full player'}
        </Text>
      </View>
    </View>
  );
}

/** How long the demo's text download takes before Download goes away. */
const DOWNLOAD_MS = 1500;

/**
 * The passage hero's actions (Canvas): the labelled Listen, Record ringed in
 * accent/record, and Download until the text is on the phone. Observing
 * greys Record's ring and says why above the row, as the hero does.
 */
function HeroActions() {
  const [last, setLast] = useState<string | null>(null);
  const [observing, setObserving] = useState(false);
  const [download, setDownload] = useState<'none' | 'downloading' | 'done'>(
    'none',
  );
  useEffect(() => {
    if (download !== 'downloading') {
      return;
    }
    const timer = setTimeout(() => setDownload('done'), DOWNLOAD_MS);
    return () => clearTimeout(timer);
  }, [download]);
  const styles = useThemedStyles(t => ({
    hero: {
      gap: t.spacing.lg,
      padding: t.spacing.lg,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.bgDefault,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.md,
    },
    primary: { paddingHorizontal: t.spacing.xl },
    hint: { ...t.type.meta, color: t.roles.fgSecondary, textAlign: 'center' },
    link: { ...t.type.label, color: t.roles.accentPrimary },
    links: { flexDirection: 'row', gap: t.spacing.lg },
  }));

  return (
    <View style={styles.hero}>
      <PassageNotices
        notices={
          observing ? [{ id: 'observer', message: RECORD_OBSERVER }] : []
        }
        testID="gallery-hero-notices"
      />
      <View style={styles.row}>
        <RoundButton
          variant="flat"
          icon={PlayFill}
          label="Listen"
          accessibilityLabel="Listen"
          onPress={() => setLast('Listen')}
          style={styles.primary}
          testID="gallery-hero-listen"
        />
        <RecordAction
          accessibilityLabel="Record"
          onPress={() => setLast('Record')}
          blocked={observing}
          testID="gallery-hero-record"
        />
        {download === 'done' ? null : (
          <RoundButton
            variant="flat"
            icon={ArrowDown}
            accessibilityLabel={
              download === 'downloading'
                ? 'Downloading the text'
                : 'Download the text'
            }
            onPress={() => setDownload('downloading')}
            disabled={download === 'downloading'}
            testID="gallery-hero-download"
          />
        )}
      </View>
      <Text style={styles.hint}>
        {last ? `Opens the player in ${last}` : 'Opens the player'}
      </Text>
      <View style={styles.links}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setObserving(o => !o)}
        >
          <Text style={styles.link}>
            {observing ? 'Translate here' : 'Observe instead'}
          </Text>
        </Pressable>
        {download === 'done' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDownload('none')}
          >
            <Text style={styles.link}>Remove the text</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Flat on blue: the translation note's Close, in Accent colors. */
function NoteHeader() {
  const [closed, setClosed] = useState(false);
  const styles = useThemedStyles(t => ({
    note: {
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.bgDefault,
      paddingBottom: t.spacing.lg,
    },
    title: { ...t.type.overline, color: t.roles.fgPrimary, flex: 1 },
    body: {
      ...t.type.lead,
      color: t.roles.fgPrimary,
      paddingHorizontal: t.spacing.xl,
    },
    link: {
      ...t.type.label,
      color: t.roles.fgPrimary,
      paddingHorizontal: t.spacing.xl,
    },
  }));

  return (
    <View style={styles.note}>
      <ScreenHeader scrolled={false}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          My blood of the covenant
        </Text>
        <RoundButton
          variant="flat"
          icon={X}
          accessibilityLabel="Close the note"
          onPress={() => setClosed(true)}
          testID="gallery-note-close"
        />
      </ScreenHeader>
      {closed ? (
        <Pressable accessibilityRole="button" onPress={() => setClosed(false)}>
          <Text style={styles.link}>Open the note again</Text>
        </Pressable>
      ) : (
        <Text style={styles.body}>
          Here, Jesus is using the possessive form to describe how his blood
          initiates the covenant.
        </Text>
      )}
    </View>
  );
}

export function RoundButtonEntry() {
  const styles = useThemedStyles(t => ({
    demos: { gap: t.spacing.xxl },
    demo: { gap: t.spacing.sm },
    demoTitle: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
  }));

  return (
    <View style={styles.demos}>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Passages · The Last Supper (Soft)</Text>
        <PassageRows />
      </View>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Player header (Flat)</Text>
        <ColorModeScope value="canvas">
          <PlayerHeader />
        </ColorModeScope>
      </View>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>
          Passage actions (Flat with a label · Record action)
        </Text>
        <ColorModeScope value="canvas">
          <HeroActions />
        </ColorModeScope>
      </View>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Translation note (Flat on Accent)</Text>
        <ColorModeScope value="accent">
          <NoteHeader />
        </ColorModeScope>
      </View>
    </View>
  );
}
