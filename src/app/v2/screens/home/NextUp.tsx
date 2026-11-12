import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ArrowRight } from '../../../../components/ui/icons';
import {
  PassageCover,
  PassageCoverFace,
} from '../../../../components/ui/PassageCover';
import type {
  NextPassage,
  NextUp as NextUpState,
} from '../../../../hooks/useNextUp';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

const HERO_COVER = 120;
const TILE_WIDTH = 140;
const PRESSED_OPACITY = 0.7;

export const NEXT_UP_EMPTY_MESSAGE =
  'Nothing to record right now. Pick a chapter from a book below.';

/** "Keep recording" on a part-recorded passage, else "Start recording". */
export function nextUpAction({ passage }: NextPassage): string {
  return passage.recordedStatus === 'partial'
    ? 'Keep recording'
    : 'Start recording';
}

/**
 * e.g. "Draft · Gospels Phase 1 · Upload pending"; the cover already names
 * the chapter, so a milestone named for its book is left out. A conflict or a
 * take still on the phone shows as on Legacy's My Work row.
 */
export function nextUpStatusLine({ chapter }: NextPassage): string {
  return [
    chapterRole(chapter),
    chapter.milestoneName.trim().toLowerCase() ===
    chapter.bookName.trim().toLowerCase()
      ? null
      : chapter.milestoneName,
    chapter.hasConflict
      ? 'Sync conflict'
      : chapter.syncState === 'deviceOnly'
      ? 'Upload pending'
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function chapterRole(chapter: NextPassage['chapter']): string {
  if (chapter.listAccess === 'observer') return 'Observing';
  if (chapter.listAccess === 'open_peer') return 'Open peer check';
  if (chapter.workflowStage === 'peer_check') return 'Peer check';
  return chapter.workflowStage === 'draft' ? 'Draft' : 'Not started';
}

/** A pericope title; the reference alone is already on the cover. */
function passageTitle({ passage }: NextPassage): string | undefined {
  return passage.title ?? undefined;
}

/** The title, with the reference only when the title isn't already it. */
function heroLabel({ passage }: NextPassage): string {
  return passage.title
    ? `${passage.title}, ${passage.reference}`
    : passage.reference;
}

/**
 * Home's default top: the one passage to record now as a wide card, then
 * the few after it as covers, then the chapters I'm checking or observing.
 * Every one opens its passage, or the observer view for an observer.
 */
export function NextUp({
  nextUp,
  onOpen,
}: {
  nextUp: NextUpState;
  onOpen: (item: NextPassage) => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // Off-screen covers draw their art the frame after the first, so the long
  // checking rail doesn't hold up Home's arrival.
  const coversOnScreen = Math.ceil(width / (TILE_WIDTH + theme.spacing.lg));
  const [allArt, setAllArt] = useState(false);
  const ready = nextUp.status === 'ready';
  useEffect(() => {
    if (!ready || allArt) return;
    const frame = requestAnimationFrame(() => setAllArt(true));
    return () => cancelAnimationFrame(frame);
  }, [ready, allArt]);
  const styles = useThemedStyles(t => ({
    title: {
      ...t.type.title,
      color: t.roles.fgPrimary,
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.xxl,
      paddingBottom: t.spacing.md,
    },
    hero: {
      flexDirection: 'row',
      gap: t.spacing.lg,
      marginHorizontal: t.spacing.xl,
      padding: t.spacing.md,
      borderRadius: t.radius.md,
      backgroundColor: t.roles.surfaceDefault,
    },
    pressed: { opacity: PRESSED_OPACITY },
    cover: { width: HERO_COVER },
    heroText: { flex: 1, gap: t.spacing.xxs, justifyContent: 'center' },
    heroTitle: { ...t.type.body, color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.xs,
      paddingTop: t.spacing.sm,
    },
    actionLabel: { ...t.type.label, color: t.roles.accentPrimary },
    thenLabel: {
      ...t.type.label,
      color: t.roles.fgSecondary,
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.xl,
      paddingBottom: t.spacing.md,
    },
    rail: { paddingHorizontal: t.spacing.xl, gap: t.spacing.lg },
    tile: { width: TILE_WIDTH },
    empty: {
      ...t.type.body,
      color: t.roles.fgSecondary,
      paddingHorizontal: t.spacing.xl,
    },
  }));

  if (nextUp.status === 'loading') return null;
  const { hero, after, checking } = nextUp;
  const rail = (
    items: NextPassage[],
    label: (i: NextPassage) => string | undefined,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {items.map((item, index) => (
        <PassageCover
          key={item.key}
          artDeferred={!allArt && index >= coversOnScreen}
          eyebrow={item.chapter.displayLabel}
          verses={item.passage.verses}
          title={label(item)}
          reference={item.passage.reference}
          seed={item.passage.seed}
          groupSeed={item.passage.groupSeed}
          recordedVerses={item.passage.recordedVerses}
          totalVerses={item.passage.totalVerses}
          onPress={() => onOpen(item)}
          style={styles.tile}
          testID={`home-next-${item.key}`}
        />
      ))}
    </ScrollView>
  );

  return (
    <View testID="home-next-up">
      <Text style={styles.title} accessibilityRole="header">
        Next up
      </Text>
      {hero ? (
        <Pressable
          onPress={() => onOpen(hero)}
          android_disableSound
          accessibilityRole="button"
          accessibilityLabel={`${heroLabel(hero)}, ${nextUpStatusLine(
            hero,
          )}. ${nextUpAction(hero)}.`}
          style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
          testID="home-next-up-hero"
        >
          <PassageCoverFace
            eyebrow={hero.chapter.displayLabel}
            verses={hero.passage.verses}
            seed={hero.passage.seed}
            groupSeed={hero.passage.groupSeed}
            recordedVerses={hero.passage.recordedVerses}
            totalVerses={hero.passage.totalVerses}
            style={styles.cover}
          />
          <View style={styles.heroText}>
            {hero.passage.title ? (
              <Text style={styles.heroTitle} numberOfLines={2}>
                {hero.passage.title}
              </Text>
            ) : null}
            <Text style={styles.meta} numberOfLines={2}>
              {nextUpStatusLine(hero)}
            </Text>
            <View style={styles.action}>
              <Text style={styles.actionLabel}>{nextUpAction(hero)}</Text>
              <ArrowRight
                color={theme.roles.accentPrimary}
                size={theme.controlSizes.icon20}
              />
            </View>
          </View>
        </Pressable>
      ) : (
        <Text style={styles.empty} testID="home-next-up-empty">
          {NEXT_UP_EMPTY_MESSAGE}
        </Text>
      )}
      {after.length > 0 ? (
        <>
          <Text style={styles.thenLabel}>Then</Text>
          {rail(after, passageTitle)}
        </>
      ) : null}
      {checking.length > 0 ? (
        <View testID="home-checking">
          <Text style={styles.thenLabel}>Checking and observing</Text>
          {rail(checking, nextUpStatusLine)}
        </View>
      ) : null}
    </View>
  );
}
