import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ArrowDown,
  ArrowLeft,
  CheckBold,
  Gear,
  PlayFill,
} from '../../../components/ui/icons';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { RoundButton } from '../../../components/ui/RoundButton';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { SyncStatusButton } from '../../../components/ui/SyncStatusButton';
import { RECORD_OBSERVER } from '../../../constants/messages';
import {
  ColorModeScope,
  useTheme,
  useThemedStyles,
} from '../../../theme/useTheme';
import { PassageNotices } from '../../v2/screens/passage/PassageNotices';
import { RecordAction } from '../../v2/screens/passage/RecordAction';

/** Mark 14:22–25, with how each verse was recorded, as in verse mode. */
const VERSES: { verse: number; recorded: 'verse' | 'passage' | null }[] = [
  { verse: 22, recorded: 'passage' },
  { verse: 23, recorded: 'verse' },
  { verse: 24, recorded: null },
  { verse: 25, recorded: null },
];

/**
 * Soft in a light screen's header, opposite the sync cloud: the book page's
 * Back, and Home's Gear in the avatar's place until the account loads.
 */
function SoftHeaders() {
  const [last, setLast] = useState<string | null>(null);
  const styles = useThemedStyles(t => ({
    headers: { gap: t.spacing.xs },
    hint: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.headers}>
      <ScreenHeader scrolled={false}>
        <RoundButton
          icon={ArrowLeft}
          accessibilityLabel="Back"
          onPress={() => setLast('Book page · Back to Home')}
          testID="gallery-soft-back"
        />
        <SyncStatusButton status="online_synced" />
      </ScreenHeader>
      <ScreenHeader scrolled={false}>
        <RoundButton
          icon={Gear}
          accessibilityLabel="Accounts and settings"
          onPress={() => setLast('Home · Opens the Accounts sheet')}
          testID="gallery-soft-settings"
        />
        <SyncStatusButton status="online_synced" />
      </ScreenHeader>
      {last ? <Text style={styles.hint}>{last}</Text> : null}
    </View>
  );
}

/** What each verse's row says about it (VerseList). */
function verseStatus(recorded: 'verse' | 'passage' | null) {
  if (recorded === 'verse') return 'Recorded';
  if (recorded === 'passage') return 'Recorded in a passage take';
  return 'Not recorded yet';
}

/**
 * Progress ring in verse mode's verse list: each ring fills once its verse
 * is recorded, on its own or in a passage take, and shows a check. Tapping a
 * row opens Listen on it.
 */
function VerseRings() {
  const theme = useTheme();
  const [verses, setVerses] = useState(VERSES);
  const [opened, setOpened] = useState<number | null>(null);
  const styles = useThemedStyles(t => ({
    list: { gap: t.spacing.sm },
    heading: { flexDirection: 'row', justifyContent: 'space-between' },
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
    link: { ...t.type.label, color: t.roles.accentPrimary },
  }));
  const done = verses.filter(v => v.recorded !== null).length;
  const next = verses.find(v => v.recorded === null);

  return (
    <View style={styles.list}>
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          Verses
        </Text>
        <Text style={styles.meta}>
          {`${done} of ${verses.length} recorded`}
        </Text>
      </View>
      {verses.map(v => {
        const status = verseStatus(v.recorded);
        return (
          <Pressable
            key={v.verse}
            onPress={() => setOpened(v.verse)}
            accessibilityRole="button"
            accessibilityLabel={`Verse ${v.verse}, ${status}`}
            accessibilityHint="Opens this verse in Listen"
            style={styles.row}
          >
            <View style={styles.text}>
              <Text style={styles.name}>{`Verse ${v.verse}`}</Text>
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
                accessibilityLabel={`Verse ${v.verse} recorded`}
              >
                {v.recorded === null ? (
                  <Text style={styles.number}>{v.verse}</Text>
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
      })}
      {opened !== null ? (
        <Text style={styles.meta}>{`Opens verse ${opened} in Listen`}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          next
            ? setVerses(vs =>
                vs.map(v =>
                  v.verse === next.verse ? { ...v, recorded: 'verse' } : v,
                ),
              )
            : setVerses(VERSES)
        }
      >
        <Text style={styles.link}>
          {next ? `Record verse ${next.verse}` : 'Start over'}
        </Text>
      </Pressable>
    </View>
  );
}

/** Flat in the open player's header (Canvas): its corner Close. */
function PlayerHeader() {
  const [closed, setClosed] = useState(false);
  const styles = useThemedStyles(t => ({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.lg,
      padding: t.spacing.lg,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.bgDefault,
    },
    title: { ...t.type.overline, color: t.roles.fgPrimary, flex: 1 },
    hint: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.header}>
      <Text style={styles.title} numberOfLines={1}>
        {closed ? 'Back on the passage' : 'Mark 14:22–25'}
      </Text>
      {closed ? (
        <Pressable accessibilityRole="button" onPress={() => setClosed(false)}>
          <Text style={styles.hint}>Open the player</Text>
        </Pressable>
      ) : (
        <RoundButton
          variant="flat"
          icon={ArrowDown}
          accessibilityLabel="Close the player"
          onPress={() => setClosed(true)}
          testID="gallery-player-close"
        />
      )}
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
        <Text style={styles.demoTitle}>Book page and Home headers (Soft)</Text>
        <SoftHeaders />
      </View>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Open player (Flat)</Text>
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
        <Text style={styles.demoTitle}>Verse list (Progress ring)</Text>
        <VerseRings />
      </View>
    </View>
  );
}
