import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { Easing, LinearTransition } from 'react-native-reanimated';
import {
  PASSAGE_IMAGE_GROW_HINT,
  PASSAGE_IMAGE_SHRINK_HINT,
  PASSAGE_IMAGE_UNAVAILABLE,
  PASSAGE_IMAGES_EMPTY,
  PASSAGE_IMAGES_FAILED,
  PASSAGE_IMAGES_LOADING,
  PASSAGE_IMAGES_NO_TEXT,
  PASSAGE_IMAGES_NONE_OFFLINE,
  PASSAGE_IMAGES_RETRY,
  PASSAGE_IMAGES_RETRY_LABEL,
  PASSAGE_IMAGES_UNPREPARED,
} from '../../../../constants/messages';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { ZoomableImage } from '../../../tabs/resources/ZoomableImage';
import type { PassageImagesState } from './usePassageImages';

/** Room to tap Retry, whatever the text size. */
const MIN_TARGET = 48;
const PRESSED_OPACITY = 0.7;
/** Tiles to a row, and their crop: 4:3, filled. */
const COLUMNS = 2;
const TILE_SHAPE = 3 / 4;
/** A grown image's height before its own shape is known: 4:3. */
const GROWN_GUESS = 3 / 4;
/** The tallest a grown image gets, against its width; taller ones fit inside. */
const GROWN_MAX = 1.5;
const NONE: ReadonlySet<string> = new Set();

/**
 * The passage's images and maps, two to a row. A tap grows one to its own
 * row at its whole, uncropped shape, pushing the rest along, and a second
 * tap shrinks it; one grows at a time. A grown one shows its caption and
 * credit. Each pinches to zoom in place. A failed load, or every image
 * failing, stays here with its own Retry; the images that did load stay
 * usable. Failures and a grown image clear when the images are for
 * something else.
 */
export function PassageImages({
  scope,
  state,
  onRetry,
  onGrown,
}: {
  /** Changes whenever the images are for something else. */
  scope: string;
  state: PassageImagesState;
  onRetry: () => void;
  /**
   * Where an image landed once grown, top and bottom in its parent's space,
   * so the list it's in can bring it to the middle.
   */
  onGrown?: (top: number, bottom: number) => void;
}) {
  const { roles, spacing } = useTheme();
  const styles = useThemedStyles(t => ({
    message: { ...t.type.body, color: t.roles.fgSecondary },
    failed: { gap: t.spacing.sm, alignItems: 'flex-start' },
    retry: {
      minHeight: MIN_TARGET,
      justifyContent: 'center',
      paddingHorizontal: t.spacing.md,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.surfaceDefault,
    },
    retryText: { ...t.type.label, color: t.roles.accentPrimary },
    pressed: { opacity: PRESSED_OPACITY },
    loading: { minHeight: MIN_TARGET, justifyContent: 'center' },
    list: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: t.spacing.md,
      rowGap: t.spacing.lg,
    },
  }));

  const ids = state.status === 'ready' ? state.items.map(i => i.id) : [];
  const resetKey = `${scope}:${state.status}:${ids.join('|')}`;
  const [failedIds, setFailedIds] = useState(NONE);
  const [grownId, setGrownId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(0);
  const [listTop, setListTop] = useState(0);
  /**
   * The grown image already reported, and whether its real size was known
   * then: each grow reports once, and again once its real shape replaces
   * the guessed one.
   */
  const reported = useRef<string | null>(null);
  // Reset in render so failures reported in the same commit aren't lost, and
  // so a reload through loading never brings back an old grown image or failure.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setFailedIds(NONE);
    setGrownId(null);
  }

  const onImageFailed = useCallback(
    (id: string) =>
      setFailedIds(prev => (prev.has(id) ? prev : new Set(prev).add(id))),
    [],
  );
  const retry = () => {
    setFailedIds(NONE);
    onRetry();
  };

  const failedBody = (
    <View style={styles.failed} testID="passage-images-error">
      <Text style={styles.message} accessibilityLiveRegion="polite">
        {PASSAGE_IMAGES_FAILED}
      </Text>
      <Pressable
        onPress={retry}
        android_disableSound
        accessibilityRole="button"
        accessibilityLabel={PASSAGE_IMAGES_RETRY_LABEL}
        style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        testID="passage-images-retry"
      >
        <Text style={styles.retryText}>{PASSAGE_IMAGES_RETRY}</Text>
      </Pressable>
    </View>
  );

  if (state.status === 'loading') {
    return (
      <View
        style={styles.loading}
        accessible
        accessibilityLabel={PASSAGE_IMAGES_LOADING}
        testID="passage-images-loading"
      >
        <ActivityIndicator color={roles.fgSecondary} />
      </View>
    );
  }
  if (state.status === 'failed') return failedBody;
  if (state.status === 'noVerses') {
    return (
      <Text style={styles.message} testID="passage-images-no-text">
        {PASSAGE_IMAGES_NO_TEXT}
      </Text>
    );
  }
  if (state.status === 'unprepared') {
    return (
      <Text style={styles.message} testID="passage-images-unprepared">
        {PASSAGE_IMAGES_UNPREPARED}
      </Text>
    );
  }
  if (state.status === 'noneOffline') {
    return (
      <Text style={styles.message} testID="passage-images-none-offline">
        {PASSAGE_IMAGES_NONE_OFFLINE}
      </Text>
    );
  }
  if (state.items.length === 0) {
    return (
      <Text style={styles.message} testID="passage-images-empty">
        {PASSAGE_IMAGES_EMPTY}
      </Text>
    );
  }
  // Every asset failing reads as a failed load, never as an empty passage.
  if (failedIds.size >= state.items.length) return failedBody;

  const grownAt = state.items.findIndex(item => item.id === grownId);
  const items =
    grownAt < 0 ? state.items : ownRow(state.items, grownAt, COLUMNS);
  const onGrownLayout = (
    id: string,
    top: number,
    bottom: number,
    sized: boolean,
  ) => {
    const key = `${id}:${sized}`;
    if (reported.current === key) return;
    reported.current = key;
    onGrown?.(listTop + top, listTop + bottom);
  };

  return (
    <View
      style={styles.list}
      onLayout={e => {
        setListWidth(Math.floor(e.nativeEvent.layout.width));
        setListTop(e.nativeEvent.layout.y);
      }}
      testID="passage-images-list"
    >
      {items.map(item => (
        <ImageCard
          key={item.id}
          item={item}
          listWidth={listWidth}
          gap={spacing.md}
          failed={failedIds.has(item.id)}
          grown={grownId === item.id}
          onFailed={onImageFailed}
          onToggle={() => {
            reported.current = null;
            setGrownId(id => (id === item.id ? null : item.id));
          }}
          onGrownLayout={onGrownLayout}
        />
      ))}
    </View>
  );
}

/**
 * The order with the item at `grownAt` on its own row, where it was: it
 * moves to the start of its row, and the rest of its row drops to pair with
 * what follows, so no row above the last is left short.
 */
export function ownRow<T>(items: T[], grownAt: number, columns: number): T[] {
  const rowStart = grownAt - (grownAt % columns);
  const rest = items.filter((_, i) => i !== grownAt);
  return [...rest.slice(0, rowStart), items[grownAt], ...rest.slice(rowStart)];
}

function ImageCard({
  item,
  listWidth,
  gap,
  failed,
  grown,
  onFailed,
  onToggle,
  onGrownLayout,
}: {
  item: ImagesMapsItem;
  /** The list's width; nothing is sized until it's known. */
  listWidth: number;
  gap: number;
  failed: boolean;
  grown: boolean;
  onFailed: (id: string) => void;
  onToggle: () => void;
  /** Where it landed once grown, top and bottom within the list. */
  onGrownLayout: (
    id: string,
    top: number,
    bottom: number,
    /** Its real shape is known (or never will be), not guessed. */
    sized: boolean,
  ) => void;
}) {
  const { motion, roles } = useTheme();
  // A tap moves the tiles, nothing throws them: the Foundations curve, with
  // no spring's overshoot on every tile at once.
  const reflow = useMemo(() => {
    const { x1, y1, x2, y2 } = motion.easeStandard;
    return LinearTransition.duration(motion.releaseMs).easing(
      Easing.bezier(x1, y1, x2, y2),
    );
  }, [motion]);
  const styles = useThemedStyles(t => ({
    card: { gap: t.spacing.xs },
    preview: {
      borderRadius: t.radius.md,
      overflow: 'hidden',
      backgroundColor: t.roles.surfaceSunken,
    },
    zoom: { width: '100%', height: '100%' },
    cover: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.roles.surfaceSunken,
    },
    unavailable: { ...t.type.label, color: t.roles.fgSecondary },
    text: { gap: t.spacing.xxs },
    // Tiles match the book page's passage covers; a grown one reads as a card.
    title: { ...t.type.label, color: t.roles.fgPrimary },
    grownTitle: { ...t.type.body, color: t.roles.fgPrimary },
    caption: { ...t.type.label, color: t.roles.fgSecondary },
    attribution: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const previewUri = item.thumbnailUri?.trim() || item.uri;
  const shape = size ? size.height / size.width : GROWN_GUESS;
  const tooTall = grown && shape > GROWN_MAX;
  const width = grown ? listWidth : (listWidth - gap * (COLUMNS - 1)) / COLUMNS;
  const height = grown
    ? width * Math.min(shape, GROWN_MAX)
    : width * TILE_SHAPE;
  if (listWidth <= 0) return null;

  return (
    <Animated.View
      layout={reflow}
      style={[styles.card, { width }]}
      onLayout={
        grown
          ? e => {
              const { y, height: tall } = e.nativeEvent.layout;
              onGrownLayout(item.id, y, y + tall, size !== null || failed);
            }
          : undefined
      }
      testID={`passage-image-${item.id}`}
    >
      <Animated.View
        layout={reflow}
        style={[styles.preview, { height }]}
        testID={`passage-image-${item.id}-preview`}
      >
        {failed ? (
          <View style={styles.cover} testID={`passage-image-${item.id}-failed`}>
            <Text style={styles.unavailable}>{PASSAGE_IMAGE_UNAVAILABLE}</Text>
          </View>
        ) : (
          <>
            {/* A fresh zoom each way, so a shrunk tile isn't left zoomed. */}
            <ZoomableImage
              key={grown ? 'grown' : 'tile'}
              uri={previewUri}
              accessibilityLabel={item.title}
              style={styles.zoom}
              contentFit={tooTall ? 'contain' : 'cover'}
              hostBackgroundColor={roles.surfaceSunken}
              onLoad={setSize}
              onLoadError={() => onFailed(item.id)}
              onPress={onToggle}
              testID={`passage-image-${item.id}-zoom`}
            />
            {size ? null : (
              <View style={styles.cover} pointerEvents="none">
                <ActivityIndicator color={roles.fgSecondary} />
              </View>
            )}
          </>
        )}
      </Animated.View>
      {/* The words grow it too, and are how TalkBack reaches it. */}
      <Pressable
        onPress={onToggle}
        android_disableSound
        accessibilityRole="button"
        accessibilityLabel={item.title}
        accessibilityHint={
          grown ? PASSAGE_IMAGE_SHRINK_HINT : PASSAGE_IMAGE_GROW_HINT
        }
        accessibilityState={{ expanded: grown }}
        style={styles.text}
        testID={`passage-image-${item.id}-toggle`}
      >
        <Text
          style={grown ? styles.grownTitle : styles.title}
          numberOfLines={grown ? undefined : 2}
        >
          {item.title}
        </Text>
        {grown && item.caption ? (
          <Text
            style={styles.caption}
            testID={`passage-image-${item.id}-caption`}
          >
            {item.caption}
          </Text>
        ) : null}
        {grown && item.attribution ? (
          <Text
            style={styles.attribution}
            testID={`passage-image-${item.id}-attribution`}
          >
            {item.attribution}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
