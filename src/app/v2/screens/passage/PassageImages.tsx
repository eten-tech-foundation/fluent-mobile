import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CornersOut } from '../../../../components/ui/icons';
import {
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
/** Legacy's card preview height. */
const PREVIEW_HEIGHT = 160;
const NONE: ReadonlySet<string> = new Set();

/**
 * The passage's images and maps as cards. Each pinches to zoom in place and
 * opens full screen. A failed load, or every image failing, stays here with
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
  const { roles } = useTheme();
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
    list: { gap: t.spacing.xl },
  }));

  const ids = state.status === 'ready' ? state.items.map(i => i.id) : [];
  const resetKey = `${scope}:${state.status}:${ids.join('|')}`;
  const [failedIds, setFailedIds] = useState(NONE);
  const [openItem, setOpenItem] = useState<ImagesMapsItem | null>(null);
  // Reset in render so failures reported in the same commit aren't lost, and
  // so a reload through loading never brings back an old viewer or failure.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setFailedIds(NONE);
    setOpenItem(null);
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
      <View style={styles.list} testID="passage-images-list">
        {state.items.map(item => (
          <ImageCard
            key={item.id}
            item={item}
            failed={failedIds.has(item.id)}
            onFailed={onImageFailed}
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
  failed,
  onFailed,
  onOpen,
}: {
  item: ImagesMapsItem;
  failed: boolean;
  onFailed: (id: string) => void;
  onOpen: () => void;
}) {
  const { controlSizes, roles } = useTheme();
  const styles = useThemedStyles(t => ({
    card: { gap: t.spacing.xs },
    preview: {
      height: PREVIEW_HEIGHT,
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
    title: { ...t.type.body, color: t.roles.fgPrimary },
    caption: { ...t.type.label, color: t.roles.fgSecondary },
    attribution: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  const [loaded, setLoaded] = useState(false);
  const previewUri = item.thumbnailUri?.trim() || item.uri;

  return (
    <View style={styles.card} testID={`passage-image-${item.id}`}>
      <View style={styles.preview}>
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
              contentFit="cover"
              hostBackgroundColor={roles.surfaceSunken}
              onLoad={() => setLoaded(true)}
              onLoadError={() => onFailed(item.id)}
              onPress={onOpen}
              testID={`passage-image-${item.id}-zoom`}
            />
            {loaded ? null : (
              <View style={styles.cover} pointerEvents="none">
                <ActivityIndicator color={roles.fgSecondary} />
              </View>
            )}
          </>
        )}
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
      </View>
      <Text style={styles.title}>{item.title}</Text>
      {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
      {item.attribution ? (
        <Text style={styles.attribution}>{item.attribution}</Text>
      ) : null}
    </View>
  );
}
