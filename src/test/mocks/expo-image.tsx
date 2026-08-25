import React from 'react';
import { View, type ViewProps } from 'react-native';

type MockImageProps = ViewProps & {
  source?: { uri?: string } | string | number;
  onError?: () => void;
  onLoad?: () => void;
  accessibilityLabel?: string;
};

/**
 * Lightweight expo-image stand-in for Jest (no native Glide/SDWebImage).
 */
export function Image({ onError: _onError, onLoad, ...props }: MockImageProps) {
  React.useEffect(() => {
    onLoad?.();
  }, [onLoad]);

  return <View {...props} />;
}

export default { Image };
