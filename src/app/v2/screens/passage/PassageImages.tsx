import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { Easing, LinearTransition } from 'react-native-reanimated';
import { CornersOut } from '../../../../components/ui/icons';
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
  passageImageOpenLabel,
} from '../../../../constants/messages';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { ZoomableImage } from '../../../tabs/resources/ZoomableImage';
import { ImageViewer } from './ImageViewer';
import type { PassageImagesState } from './usePassageImages';

/** Room to tap Retry or open an image, whatever the text size. */
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
 * credit and a corner button to open it full screen. Each pinches to zoom. A failed load, or every image failing, stays here with
 * its own Retry; the images that did load stay usable. Failures and an open
 * image clear when the images are for something else.
 */
export function PassageImages({
  scope,
  state,
  onRetry,
}: {
  /** Changes whenever the images are for something else. */
  scope: string;
  state: PassageImagesState;
  onRetry: () => void;
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
  const [openItem, setOpenItem] = useState<ImagesMapsItem | null>(null);
  const [grownId, setGrownId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(0);
  // Reset in render so failures reported in the same commit aren't lost, and
  // so a reload through loading never brings back an old viewer or failure.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setFailedIds(NONE);
    setOpenItem(null);
    setGrownId(null);
  }

  const onImageFailed = useCallback(
    (id: string) =>
      setFailedIds(prev => (prev.has(id) ? prev : new Set(prev).add(id))),
    [],
  );
  const retry = () => {
    setFailedIds(NONE);
    setOpenItem(null);
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

  return (
    <>
      <View
        style={styles.list}
        onLayout={e => setListWidth(Math.floor(e.nativeEvent.layout.width))}
        testID="passage-images-list"
      >
        {state.items.map(item => (
          <ImageCard
            key={item.id}
            item={item}
            listWidth={listWidth}
            gap={spacing.md}
            failed={failedIds.has(item.id)}
            grown={grownId === item.id}
            onFailed={onImageFailed}
            onToggle={() => setGrownId(id => (id === item.id ? null : item.id))}
            onOpen={() => setOpenItem(item)}
          />
        ))}
      </View>
      <ImageViewer item={openItem} onClose={() => setOpenItem(null)} />
    </>
  );
}

function ImageCard({
  item,
  listWidth,
  gap,
  failed,
  grown,
  onFailed,
  onToggle,
  onOpen,
}: {
  item: ImagesMapsItem;
  /** The list's width; nothing is sized until it's known. */
  listWidth: number;
  gap: number;
  failed: boolean;
  grown: boolean;
  onFailed: (id: string) => void;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { controlSizes, motion, roles } = useTheme();
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
    open: {
      position: 'absolute',
      top: t.spacing.sm,
      right: t.spacing.sm,
      width: MIN_TARGET,
      height: MIN_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.full,
      backgroundColor: t.roles.surfaceInverse,
    },
    pressed: { opacity: PRESSED_OPACITY },
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
            <ZoomableImage
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
        {grown ? (
          <Pressable
            onPress={onOpen}
            android_disableSound
            accessibilityRole="button"
            accessibilityLabel={passageImageOpenLabel(item.title)}
            style={({ pressed }) => [styles.open, pressed && styles.pressed]}
            testID={`passage-image-${item.id}-open`}
          >
            <CornersOut size={controlSizes.icon24} color={roles.fgOnInverse} />
          </Pressable>
        ) : null}
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
          <Text style={styles.caption}>{item.caption}</Text>
        ) : null}
        {grown && item.attribution ? (
          <Text style={styles.attribution}>{item.attribution}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
