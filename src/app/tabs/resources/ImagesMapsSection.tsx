import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ImageThumbnail } from './ImageThumbnail';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import type { ImagesMapsLoadState } from '../../../hooks/useImagesMapsForUnit';
import { IMAGES_MAPS_LOAD_ERROR } from '../../../constants/messages';
import { ImagesMapsItem } from '../../../types/resources/imagesMaps';
import { theme } from '../../../theme';

type ImagesMapsSectionProps = {
  state: ImagesMapsLoadState;
  retry: () => void;
};

function ImagesMapsErrorBody({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.centered} testID="images-maps-error">
      <Text style={styles.errorMessage}>{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading Images and Maps"
        testID="images-maps-retry"
      >
        <Text style={styles.retryLink}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Images & Maps body for the Resources tab (#191 / #348).
 * Thumbnails with caption/attribution, pinch-zoom, fullscreen maximize.
 * Empty availability is handled by the parent (hide the accordion slot).
 * Asset load failures (e.g. offline after metadata resolved) escalate to the
 * same section-scoped error + Retry as metadata/network failures.
 */
export function ImagesMapsSection({ state, retry }: ImagesMapsSectionProps) {
  const [fullscreenItem, setFullscreenItem] = useState<ImagesMapsItem | null>(
    null,
  );
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  const itemIdsKey =
    state.status === 'ready' ? state.items.map(item => item.id).join('|') : '';
  const resetKey = `${state.status}:${itemIdsKey}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  // Reset failure tracking when the unit/load status changes (render-time sync so
  // we do not clear failures reported by children in the same commit).
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setFailedIds(new Set());
    setFullscreenItem(null);
  }

  const handleImageFailed = useCallback((itemId: string) => {
    setFailedIds(prev => {
      if (prev.has(itemId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  const handleRetry = useCallback(() => {
    setFailedIds(new Set());
    setFullscreenItem(null);
    retry();
  }, [retry]);

  if (state.status === 'loading') {
    return (
      <View style={styles.centered} testID="images-maps-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <ImagesMapsErrorBody
        message={state.message || IMAGES_MAPS_LOAD_ERROR}
        onRetry={handleRetry}
      />
    );
  }

  if (state.items.length === 0) {
    return null;
  }

  if (failedIds.size >= state.items.length) {
    return (
      <ImagesMapsErrorBody
        message={IMAGES_MAPS_LOAD_ERROR}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <>
      <View style={styles.list} testID="images-maps-list">
        {state.items.map(item => (
          <ImageThumbnail
            key={item.id}
            item={item}
            onOpenFullscreen={setFullscreenItem}
            onLoadError={handleImageFailed}
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
