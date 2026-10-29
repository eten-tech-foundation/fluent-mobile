import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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

/** e.g. "Draft · Gospels Phase 1"; the cover already names the chapter. */
export function nextUpStatusLine({ chapter }: NextPassage): string {
  const stage = chapter.workflowStage === 'draft' ? 'Draft' : 'Not started';
  return `${stage} · ${chapter.milestoneName}`;
}

function passageTitle({ passage }: NextPassage): string {
  return passage.title ?? passage.reference;
}

/** The title, with the reference only when the title isn't already it. */
function heroLabel({ passage }: NextPassage): string {
  return passage.title
    ? `${passage.title}, ${passage.reference}`
    : passage.reference;
}

/**
 * Home's default top: the one passage to record now as a wide card, then
 * the few after it as covers. Every one opens its passage.
 */
export function NextUp({
  nextUp,
  onOpen,
}: {
  nextUp: NextUpState;
  onOpen: (item: NextPassage) => void;
}) {
  const theme = useTheme();
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
  const { hero, after } = nextUp;

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
            <Text style={styles.heroTitle} numberOfLines={2}>
              {passageTitle(hero)}
            </Text>
            {hero.passage.title ? (
              <Text style={styles.meta} numberOfLines={1}>
                {hero.passage.reference}
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {after.map(item => (
              <PassageCover
                key={item.key}
                eyebrow={item.chapter.displayLabel}
                verses={item.passage.verses}
                title={passageTitle(item)}
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
        </>
      ) : null}
    </View>
  );
}
