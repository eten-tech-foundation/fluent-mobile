import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Maximize2 } from 'lucide-react-native';
import { ZoomableImage } from './ZoomableImage';
import { ImagesMapsItem } from '../../../types/resources/imagesMaps';
import { theme, iconSizes, listIconStrokeWidth } from '../../../theme';

type ImageThumbnailProps = {
  item: ImagesMapsItem;
  onOpenFullscreen: (item: ImagesMapsItem) => void;
  /** Called when the remote/local image asset fails to decode or download. */
  onLoadError?: (itemId: string) => void;
};

/**
 * Thumbnail row with pinch-zoom preview, caption/attribution, and maximize (#191).
 */
export function ImageThumbnail({
  item,
  onOpenFullscreen,
  onLoadError,
}: ImageThumbnailProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageLoading(true);
    setImageFailed(false);
  }, [item.id, item.uri]);

  const handleLoadError = () => {
    setImageLoading(false);
    setImageFailed(true);
    onLoadError?.(item.id);
  };

  return (
    <View style={styles.card} testID={`images-maps-item-${item.id}`}>
      <View style={styles.preview}>
        {imageFailed ? (
          <View
            style={styles.placeholder}
            testID={`images-maps-placeholder-${item.id}`}
          >
            <Text style={styles.placeholderText}>Image unavailable</Text>
          </View>
        ) : (
          <>
            <ZoomableImage
              uri={item.uri}
              accessibilityLabel={item.title}
              style={styles.zoomHost}
              contentFit="cover"
              testID={`images-maps-zoom-${item.id}`}
              onLoad={() => setImageLoading(false)}
              onLoadError={handleLoadError}
              onPress={() => onOpenFullscreen(item)}
            />
            {imageLoading ? (
              <View
                style={styles.loadingOverlay}
                pointerEvents="none"
                testID={`images-maps-image-loading-${item.id}`}
              >
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : null}
          </>
        )}
        <TouchableOpacity
          style={styles.maximizeButton}
          onPress={() => onOpenFullscreen(item)}
          accessibilityRole="button"
          accessibilityLabel={`Open full screen ${item.title}`}
          testID={`images-maps-maximize-${item.id}`}
        >
          <Maximize2
            size={iconSizes.chevron}
            color={theme.colors.primaryForeground}
            strokeWidth={listIconStrokeWidth}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>{item.title}</Text>
      {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
      {item.attribution ? (
        <Text style={styles.attribution}>{item.attribution}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.xs,
  },
  preview: {
    position: 'relative',
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  zoomHost: {
    width: '100%',
    height: 160,
    borderRadius: theme.radius.sm,
  },
  placeholder: {
    width: '100%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.sm,
  },
  placeholderText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.sm,
  },
  maximizeButton: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  caption: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
    lineHeight: theme.typography.lineHeights.normal,
  },
  attribution: {
    fontSize: theme.typography.sizes.xs,
    fontStyle: 'italic',
    color: theme.colors.mutedForeground,
  },
});
