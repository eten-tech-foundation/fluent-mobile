import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZoomableImage } from './ZoomableImage';
import { ImagesMapsItem } from '../../../types/resources/imagesMaps';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../../theme';

type FullscreenImageViewerProps = {
  item: ImagesMapsItem | null;
  onClose: () => void;
};

/**
 * Full-screen image/map viewer with pinch-zoom and pan (#191).
 */
export function FullscreenImageViewer({
  item,
  onClose,
}: FullscreenImageViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [item?.id]);

  const visible = item !== null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <View
          style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}
        >
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {item?.title ?? ''}
            </Text>
            {item?.attribution ? (
              <Text style={styles.attribution} numberOfLines={1}>
                {item.attribution}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={touchHitSlop}
            accessibilityRole="button"
            accessibilityLabel="Close full screen image"
            testID="images-maps-fullscreen-close"
            style={styles.closeButton}
          >
            <X
              size={iconSizes.headerTab}
              color={theme.colors.primaryForeground}
              strokeWidth={listIconStrokeWidth}
            />
          </Pressable>
        </View>

        <View style={styles.body} testID="images-maps-fullscreen">
          {item && !imageFailed ? (
            <ZoomableImage
              key={item.id}
              uri={item.uri}
              accessibilityLabel={item.title}
              style={{ width, height: height * 0.7 }}
              contentFit="contain"
              testID="images-maps-fullscreen-zoom"
              onLoadError={() => setImageFailed(true)}
            />
          ) : (
            <Text style={styles.placeholder}>Image unavailable</Text>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.foreground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  headerText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primaryForeground,
  },
  attribution: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  closeButton: {
    padding: theme.spacing.sm,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
  },
});
