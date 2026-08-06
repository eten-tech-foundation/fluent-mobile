import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ImageThumbnail } from './ImageThumbnail';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import { useImagesMapsForUnit } from '../../../hooks/useImagesMapsForUnit';
import { IMAGES_MAPS_LOAD_ERROR } from '../../../constants/messages';
import { ImagesMapsItem } from '../../../types/resources/imagesMaps';
import { theme } from '../../../theme';

type ImagesMapsSectionProps = {
  chapterId: number;
  verseNumber: number;
};

/**
 * Images & Maps body for the Resources tab (#191).
 * Thumbnails with caption/attribution, pinch-zoom, fullscreen maximize.
 */
export function ImagesMapsSection({
  chapterId,
  verseNumber,
}: ImagesMapsSectionProps) {
  const { state, retry } = useImagesMapsForUnit(chapterId, verseNumber);
  const [fullscreenItem, setFullscreenItem] = useState<ImagesMapsItem | null>(
    null,
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.centered} testID="images-maps-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered} testID="images-maps-error">
        <Text style={styles.errorMessage}>{IMAGES_MAPS_LOAD_ERROR}</Text>
        <TouchableOpacity
          onPress={() => void retry()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading Images and Maps"
          testID="images-maps-retry"
        >
          <Text style={styles.retryLink}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state.items.length === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.list} testID="images-maps-list">
        {state.items.map(item => (
          <ImageThumbnail
            key={item.id}
            item={item}
            onOpenFullscreen={setFullscreenItem}
          />
        ))}
      </View>
      <FullscreenImageViewer
        item={fullscreenItem}
        onClose={() => setFullscreenItem(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  errorMessage: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  retryLink: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
});
