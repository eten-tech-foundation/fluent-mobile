import React from 'react';
import { View, type ViewProps } from 'react-native';

type MockLoadEvent = {
  cacheType: 'none';
  source: { url: string; width: number; height: number; mediaType: null };
};

type MockImageProps = ViewProps & {
  source?: { uri?: string } | string | number;
  onError?: () => void;
  onLoad?: (event: MockLoadEvent) => void;
  accessibilityLabel?: string;
};

/**
 * Lightweight expo-image stand-in for Jest (no native Glide/SDWebImage).
 * Loads at once, with an event shaped like expo-image's (a 1 × 1 source).
 */
export function Image({ onError: _onError, onLoad, ...props }: MockImageProps) {
  React.useEffect(() => {
    const url = typeof props.source === 'object' ? props.source.uri ?? '' : '';
    onLoad?.({
      cacheType: 'none',
      source: { url, width: 1, height: 1, mediaType: null },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLoad]);

  return <View {...props} />;
}

export default { Image };
